# Address Search updates

Local Mac copy of the updater read for this note: `~/dev/tak-stack/cloudtak.sh` (`update`).
That command `git pull`s `CLOUDTAK_DIR` (default `~/tak-stack/CloudTAK` on the VPS), rebuilds
`cloudtak-api` with `--no-cache`, rebuilds the other CloudTAK images, and starts the stack.
It does not pull this plugin repo.

`api/bin/plugin.ts` clones a `WEB_PLUGINS` URL only when `app/plugins/<name>/` is missing.
An existing checkout is left as-is (`ok - plugin 'address-search' already present, skipping clone`),
then its `public/` files are copied into the image.

## This change

The search button is mounted on a hidden host (`lib/mount-toggle.ts`, id
`address-search-toggle-root`). Enable and disable call `bottomBar.remove('address-search')`
so a key left by an older build cannot hold PluginPane's 50px strip open. The button is still
teleported to `<body>` under the left map controls. Anchor math is unchanged.

Lives in this repo (`cloudtak-plugin-address-search`). It is not a patch inside the CloudTAK
tree, so a CloudTAK `git pull` does not drop it and does not conflict with it.

## First deploy

On the VPS, update the existing `app/plugins/address-search` checkout to this commit (the image
build will not clone over it). Rebuild and restart:

```sh
# from the tak-stack directory, after the plugin checkout is updated
docker compose -p tak-stack build cloudtak-api --no-cache
./cloudtak.sh start
```

Hard-refresh the browser.

## After a later CloudTAK update

`./cloudtak.sh update` rebuilds `cloudtak-api` from the plugin directory already on disk.
If that directory is still this checkout, the hidden-host mount survives the update.
If the directory was deleted, the next image build clones `WEB_PLUGINS` again — point that URL
at a commit that contains this mount, or the clone comes back with the old bottom-bar registration
and the blank strip returns.

There is nothing to re-apply inside CloudTAK and nothing to retire once upstream CloudTAK changes.
Retire this note when a deployed build no longer registers the search button on the bottom bar.

## Verify

Inside the running tree (or the plugin checkout that was copied into the image):

```sh
grep -R -n --include='*.ts' --include='*.vue' 'bottomBar.add' app/plugins/address-search
```

The only hit should be the negative assertion in `test/toggle-host.spec.ts`. A hit in `index.ts`
means the blank strip is still registered.

On the map, with the plugin enabled, the left control column has the pin button and no empty
50px bar under the map.
