# Math Clock: GNOME Shell extension

Shows the time as two arithmetic riddles (hour, minutes) in the top bar and/or on the desktop.
Targets GNOME Shell 50. The riddle generator is shared with the web version (`../web/riddle.js`).

## Install

```bash
./build.sh --install
```

Then log out and back in (Wayland can't reload the shell in place) and run:

```bash
gnome-extensions enable mathclock@cbandera.github.io
```

Settings: `gnome-extensions prefs mathclock@cbandera.github.io`, or "Settings" in the top bar menu.

## Use

- **Top bar:** shows the riddles in compact form. Click to see them large, show the answers, or change the difficulty.
- **Desktop:** a large clock behind your windows. Click it to show or hide the answers.
- **Auto-reveal:** answers appear during the last 10 seconds of each minute.
- **Replace the system clock:** puts the riddles where the clock is. This also hides notifications and the calendar.

## Develop

- Edit `../web/riddle.js`, not `riddle.js` here; `build.sh` regenerates the ES module wrapper.
- Smoke test against mocked Shell APIs (no GNOME needed):

  ```bash
  cd test && node --import ./register.mjs smoke.mjs
  ```

- Live logs while testing: `journalctl -f -o cat /usr/bin/gnome-shell`
- To test without logging out, run a nested shell (needs the mutter dev-kit package):

  ```bash
  dbus-run-session gnome-shell --devkit --wayland
  ```

## Notes

The desktop clock is added to `Main.layoutManager._backgroundGroup`, which is private Shell API.
That's what desktop-widget extensions rely on, but it could change in a future GNOME release.
