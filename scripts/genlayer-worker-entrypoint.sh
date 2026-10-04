#!/bin/sh
set -eu

export HOME="${RAILWAY_VOLUME_MOUNT_PATH:-/var/lib/tolerance-genlayer}"
export GENLAYER_KEYSTORE_PATH="${GENLAYER_KEYSTORE_PATH:-$HOME/keystore/tolerance-studionet-submitter.json}"

if [ ! -f "$GENLAYER_KEYSTORE_PATH" ]; then
  echo '{"event":"GENLAYER_WORKER_KEYSTORE_NOT_READY"}'
  exec tail -f /dev/null
fi

: "${GENLAYER_KEYSTORE_PASSWORD:?GENLAYER_KEYSTORE_PASSWORD is required}"

# The installed GenLayer CLI stores the decrypted account only through keytar.
# On a Linux worker that means an isolated Secret Service session; it never
# writes a plaintext key into the volume or application environment.
# Runtime sockets must not survive a container restart. The encrypted keyring
# data remains volume-backed under HOME, while this session socket is transient.
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/tmp/tolerance-genlayer-runtime}"
mkdir -p "$XDG_RUNTIME_DIR" "$HOME/.local/share/keyrings"
chmod 0700 "$XDG_RUNTIME_DIR"
eval "$(dbus-launch --sh-syntax)"
# Initialize/unlock the default login collection before keytar asks Secret
# Service for it. Its password is the sealed Railway keystore secret; no raw
# signing key is written to an environment variable or plaintext file.
printf '%s' "$GENLAYER_KEYSTORE_PASSWORD" | gnome-keyring-daemon --unlock
eval "$(gnome-keyring-daemon --start --components=secrets)"

if ! genlayer account list | grep -qi 'tolerance-studionet-submitter'; then
  test -f "$GENLAYER_KEYSTORE_PATH"
  genlayer account import \
    --name tolerance-studionet-submitter \
    --keystore "$GENLAYER_KEYSTORE_PATH" \
    --source-password "$GENLAYER_KEYSTORE_PASSWORD" \
    --password "$GENLAYER_KEYSTORE_PASSWORD" \
    --overwrite
fi

genlayer account use tolerance-studionet-submitter
genlayer account unlock \
  --account tolerance-studionet-submitter \
  --password "$GENLAYER_KEYSTORE_PASSWORD"
genlayer network set studionet

exec node --conditions=react-server .worker-build/scripts/genlayer-worker.js
