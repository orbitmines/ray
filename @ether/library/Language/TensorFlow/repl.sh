#!/usr/bin/env bash
exec python3 -c "import tensorflow as tf; print('TensorFlow', tf.__version__); import code; code.interact(local=dict(globals(), **locals()))"
