# ComfyUI-dynamicvramstats

A ComfyUI plugin that visualizes dynamic VRAM page residency in real-time. Shows a 2D grid of VRAM pages for each loaded model, color-coded by status.

Requires [comfy-aimdo](https://github.com/Comfy-Org/comfy-aimdo) with per-page residency introspection API (merged to master).

## Known Issues

- **Missing filenames for some model types**: The source filename is only available for diffusion models and CLIP models. VAE and some other model types don't store their filename on the model patcher object, so they are displayed by class name only. This is a ComfyUI core limitation.
