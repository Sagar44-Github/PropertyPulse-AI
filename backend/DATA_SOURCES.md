# Data and model attribution

PropertyPulse's local image classifier is trained from the Hugging Face dataset chandrabhuma/building_defect_vqa, which labels building-surface images as algae, major crack, minor crack, peeling, plain, spalling, or stain. The dataset card lists the license as Creative Commons Attribution 4.0 (CC BY 4.0).

- Dataset: https://huggingface.co/datasets/chandrabhuma/building_defect_vqa
- Dataset source and research context: BD3 — Building Defects Detection Dataset, https://github.com/Praveenkottari/BD3-Dataset
- Dataset license: https://creativecommons.org/licenses/by/4.0/

The training script creates a deterministic stratified holdout split and records its metrics in backend/models/model_info.json. Metrics describe this small research dataset only; they are not a guarantee of performance on other buildings, camera types, materials, or lighting. The classifier predicts one image-level label. It does not localize pixels, estimate physical dimensions, or determine structural safety.

Source images used for local demonstration samples are stored under backend/samples/ and remain covered by the source dataset attribution and license. Do not remove this notice if the samples or model artifact are redistributed.
