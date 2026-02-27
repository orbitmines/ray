#!/usr/bin/env bash
npm list flapjax >/dev/null 2>&1 || npm list -g flapjax >/dev/null 2>&1 || command -v node >/dev/null 2>&1
