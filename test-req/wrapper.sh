#!/bin/zsh

TMPFILE=$(mktemp)
jq -Rs . < documentation.md > "$TMPFILE"
RAW_CONTENT=$(cat "$TMPFILE")

hurl --variable user_query="Can I recreate the state once created?" \
     --variable raw_content="$RAW_CONTENT" \
      --error-format long \
     test-cleaner.hurl

rm "$TMPFILE"
