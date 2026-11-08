---
title: Whistle In-Browser
emoji: 🎙️
colorFrom: green
colorTo: gray
sdk: static
pinned: false
license: apache-2.0
short_description: Cactus Whistle speech-to-text on WebGPU in your browser
models:
  - Cactus-Compute/whistle
  - mrfakename/whistle-ONNX
---

Runs [Cactus-Compute/whistle](https://huggingface.co/Cactus-Compute/whistle) entirely in the browser with
[onnxruntime-web](https://onnxruntime.ai/): the encoder runs on **WebGPU** (fp16 when the adapter supports
`shader-f16`) and the per-token decoder runs on WebAssembly, which is faster for single-token steps. Without
WebGPU, both run on WebAssembly.

The ONNX graphs come from a PyTorch re-implementation of Whistle that matches the Cactus engine
([mrfakename/whistle-ONNX](https://huggingface.co/mrfakename/whistle-ONNX)). Weights ship as one ~17 MB pack that
keeps the original CQ quantization and is expanded in the browser. It is downloaded with parallel range requests
and kept in the Cache API, so later visits load offline.

URL overrides: `?enc=wasm|webgpu&dec=wasm|webgpu&prec=fp32|fp16`.

Notes: decoding is greedy, and keyword biasing is an approximation of the engine's. Word timestamps use DTW over
cross-attention and agree with the engine to within one 80 ms frame.
