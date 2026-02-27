#!/usr/bin/env bash
exec python3 -c "import tensorflow_probability as tfp; import tensorflow as tf; print('TFP', tfp.__version__); import code; code.interact(local=dict(globals(), **locals()))"
