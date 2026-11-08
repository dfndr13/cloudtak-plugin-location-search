#!/usr/bin/env python3
"""Named landmarks in one US state from an OpenStreetMap extract, as a GNIS-style pipe file for build-gazetteer.

Usage: extract_landmarks.py <state name> <state.osm.pbf> <out.txt>
The state name must match the state's OpenStreetMap boundary, e.g. "Arizona" or "New Mexico".
"""
import collections
import sys

import osmium
from osmium.geom import WKTFactory
from shapely import STRtree, wkt
from shapely.geometry import Point

# (tag, value) -> class shown to the user.
CLASSES = {
    ("amenity", "university"): "University",
    ("amenity", "college"): "College",
    ("amenity", "school"): "School",
    ("amenity", "hospital"): "Hospital",
    ("amenity", "clinic"): "Clinic",
    ("amenity", "nursing_home"): "Nursing Home",
    ("amenity", "fire_station"): "Fire Station",
    ("amenity", "police"): "Police",
    ("emergency", "ambulance_station"): "EMS Station",
    ("amenity", "courthouse"): "Courthouse",
    ("amenity", "townhall"): "City Hall",
    ("amenity", "prison"): "Prison",
    ("amenity", "library"): "Library",
    ("amenity", "community_centre"): "Community Center",
    ("amenity", "place_of_worship"): "Place of Worship",
    ("amenity", "fuel"): "Gas Station",
    ("amenity", "grave_yard"): "Cemetery",
    ("landuse", "cemetery"): "Cemetery",
    ("aeroway", "aerodrome"): "Airport",
    ("aeroway", "helipad"): "Helipad",
    ("leisure", "stadium"): "Stadium",
    ("leisure", "park"): "Park",
    ("tourism", "camp_site"): "Campground",
    ("tourism", "hotel"): "Lodging",
    ("tourism", "motel"): "Lodging",
    ("man_made", "water_tower"): "Water Tower",
}

# The same place mapped twice (a point and an outline) within this many degrees (~300 m).
DEDUPE_DEG = 0.003


def classify(tags):
    for key in ("amenity", "emergency", "aeroway", "leisure", "landuse", "tourism", "man_made"):
        value = tags.get(key)
        if value and (key, value) in CLASSES:
            return CLASSES[(key, value)]
    return None


def clean(name):
    return " ".join(name.replace("|", " ").split())


class Handler(osmium.SimpleHandler):
    def __init__(self, state_name):
        super().__init__()
        self.state_name = state_name
        self.wkt = WKTFactory()
        self.found = []
        self.counties = []
        self.state = None

    def node(self, n):
        name = n.tags.get("name")
        kind = classify(n.tags) if name else None
        if kind and n.location.valid():
            self.found.append((clean(name), kind, n.location.lat, n.location.lon))

    def area(self, a):
        level = a.tags.get("admin_level")
        name = a.tags.get("name")
        if a.tags.get("boundary") == "administrative" and name:
            if level == "4" and name == self.state_name:
                self.state = wkt.loads(self.wkt.create_multipolygon(a))
            elif level == "6":
                self.counties.append((name, wkt.loads(self.wkt.create_multipolygon(a))))

        kind = classify(a.tags) if name else None
        if kind:
            try:
                point = wkt.loads(self.wkt.create_multipolygon(a)).representative_point()
            except Exception:
                return  # broken outline in the source
            self.found.append((clean(name), kind, point.y, point.x))


def main(state_name, pbf, out):
    handler = Handler(state_name)
    handler.apply_file(pbf, locations=True, idx="flex_mem")
    if handler.state is None:
        sys.exit(f"no {state_name} state boundary in the extract")

    state = handler.state
    counties = [(n, g) for n, g in handler.counties if state.intersection(g).area > 0.5 * g.area]
    tree = STRtree([g for _, g in counties])
    print(f"raw landmarks {len(handler.found)}, {state_name} counties {len(counties)}")

    seen = collections.defaultdict(list)
    rows = []
    dropped = collections.Counter()
    for name, kind, lat, lon in handler.found:
        point = Point(lon, lat)
        hits = tree.query(point, predicate="intersects")
        if len(hits) == 0:
            dropped["outside the state"] += 1
            continue
        key = (name.upper(), kind)
        if any(abs(lat - a) < DEDUPE_DEG and abs(lon - b) < DEDUPE_DEG for a, b in seen[key]):
            dropped["duplicate"] += 1
            continue
        seen[key].append((lat, lon))
        county = counties[int(hits[0])][0].removesuffix(" County")
        rows.append((name, kind, county, lat, lon))

    with open(out, "w", encoding="utf-8") as f:
        f.write("feature_name|feature_class|state_name|county_name|prim_lat_dec|prim_long_dec\n")
        for name, kind, county, lat, lon in sorted(rows):
            f.write(f"{name}|{kind}|{state_name}|{county}|{lat:.6f}|{lon:.6f}\n")

    print(f"kept {len(rows)}, dropped {dict(dropped)}")
    for kind, count in collections.Counter(r[1] for r in rows).most_common():
        print(f"  {kind}: {count}")


if __name__ == "__main__":
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2], sys.argv[3])
