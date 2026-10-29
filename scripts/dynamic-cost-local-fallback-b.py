from pathlib import Path
p=Path("sentient/src/application/production-collaboration.ts")
s=p.read_text()

old='import { HUGGINGFACE_LOCAL_DATA_HANDLING_MODE_V1 } from "../spawn/backends/huggingface.js";'
new='import { HUGGINGFACE_LOCAL_DATA_HANDLING_MODE_V1, HUGGINGFACE_LOCAL_SPAWN_BACKEND_ID_V1 } from "../spawn/backends/huggingface.js";'
if s.count(old)!=1: raise SystemExit(f"local-import:{s.count(old)}")
s=s.replace(old,new,1)

old='''  LOCAL_HF_MODEL_V1,
  LOCAL_HF_PROVIDER_V1,'''
new='''  LOCAL_HF_MODEL_REVISION_V1,
  LOCAL_HF_MODEL_V1,
  LOCAL_HF_PROVIDER_V1,'''
if s.count(old)!=1: raise SystemExit(f"model-import:{s.count(old)}")
s=s.replace(old,new,1)

old='      costRequirements: ["bounded-paid-primary"],'
if s.count(old)!=1: raise SystemExit(f"cost-requirement:{s.count(old)}")
s=s.replace(old,'      costRequirements: [],',1)

old='''    backends: {
      allowed: [ATLAS_HYBRID_SPAWN_BACKEND_ID_V1],
      denied: ["openrouter", "huggingface-inference-api"],
    },
    providers: {
      allowed: [ATLAS_HYBRID_PROVIDER_ID_V1],
      denied: ["openai", "openrouter", "huggingface"],
    },
    models: {
      allowed: [ATLAS_HYBRID_ROUTE_MODEL_ID_V1],
      denied: [] as string[],
    },
    preferenceOrder: [] as string[],'''
new='''    backends: {
      allowed: [ATLAS_HYBRID_SPAWN_BACKEND_ID_V1, HUGGINGFACE_LOCAL_SPAWN_BACKEND_ID_V1],
      denied: ["openrouter", "huggingface-inference-api"],
    },
    providers: {
      allowed: [ATLAS_HYBRID_PROVIDER_ID_V1, LOCAL_HF_PROVIDER_V1],
      denied: ["openai", "openrouter", "huggingface"],
    },
    models: {
      allowed: [ATLAS_HYBRID_ROUTE_MODEL_ID_V1, LOCAL_HF_MODEL_V1],
      denied: [] as string[],
    },
    preferenceOrder: [
      `${ATLAS_HYBRID_SPAWN_BACKEND_ID_V1}:${ATLAS_HYBRID_ROUTE_MODEL_ID_V1}`,
      `${HUGGINGFACE_LOCAL_SPAWN_BACKEND_ID_V1}:${LOCAL_HF_MODEL_V1}@${LOCAL_HF_MODEL_REVISION_V1}`,
    ],'''
if s.count(old)!=1: raise SystemExit(f"targets:{s.count(old)}")
p.write_text(s.replace(old,new,1))
