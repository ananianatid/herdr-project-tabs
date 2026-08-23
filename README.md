# Herdr Project Tabs

Herdr plugin that keeps a shared default tab set in every project workspace.

The default tabs are:

`main` · `second` · `debug` · `run` · `build` · `explore` · `git` · `terminal`

The plugin is deliberately additive: it creates missing tabs and does not remove, rename, or reorder existing tabs.

## Requirements

- Herdr `0.7.0` or newer
- Node.js available as `node`

## Install from GitHub

After publishing this repository:

```sh
herdr plugin install OWNER/herdr-project-tabs --ref v0.1.0
```

The plugin applies the default layout when Herdr starts and whenever a new workspace is created. You can also run it manually:

```sh
herdr plugin action invoke apply --plugin anatide.project-tabs
```

## Keyboard shortcut

Add this to `~/.config/herdr/config.toml`:

```toml
[[keys.command]]
key = "prefix+l"
type = "plugin_action"
command = "anatide.project-tabs.apply"
description = "apply project tabs"
```

With Herdr's default prefix, press `Ctrl+B`, release it, then press `L`.

Reload the configuration:

```sh
herdr server reload-config
```

## Local development

```sh
herdr plugin link /path/to/herdr-project-tabs
npm run verify
herdr plugin action invoke apply --plugin anatide.project-tabs
```

The plugin calls Herdr through `HERDR_BIN_PATH`, so it does not need a separate SDK or a direct socket implementation.

## License

MIT
