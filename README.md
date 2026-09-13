# Herdr Project Tabs

Herdr plugin that keeps a shared default tab set in every project workspace.

The default tabs are:

`main` · `second` · `debug` · `run` · `build` · `explore` · `git` · `terminal` · `remote`

The plugin is deliberately additive: it creates missing tabs and does not remove, rename, or reorder existing tabs.

`remote` is a regular terminal tab reserved for manually connecting to a deployment server and running deployment commands. The plugin does not open SSH connections or deploy anything automatically.

## Optional tool launch

The `explore` and `git` tabs can optionally start Yazi and Lazygit when a new workspace is created. This is disabled by default and each tool has its own setting.

Find the plugin configuration directory:

```sh
herdr plugin config-dir anatide.project-tabs
```

Create a `settings.conf` file in that directory:

```conf
# Both settings default to false when omitted.
AUTO_LAUNCH_YAZI=true
AUTO_LAUNCH_LAZYGIT=false
```

The plugin checks whether each enabled command is installed and skips it when it is unavailable. The tools are launched only in the `explore` and `git` tabs created for a new workspace; startup and manual `apply` never relaunch them.

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
