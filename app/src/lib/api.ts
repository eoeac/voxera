const BASE_URL = `http://${window.location.hostname === 'localhost' ? 'localhost' : '127.0.0.1'}:28840`;
let session: Promise<void> | null = null;

async function connectSession(): Promise<void> {
  if (!session) {
    session = fetch(`${BASE_URL}/api/session`, { credentials: 'include', signal: AbortSignal.timeout(10000) })
      .then(response => { if (!response.ok) throw new Error('Voxera session connection failed'); })
      .catch(error => { session = null; throw error; });
  }
  return session;
}

export function reportApiError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  window.dispatchEvent(new CustomEvent('voxera-error', { detail: message }));
}

async function apiFetch(url: string, init: RequestInit = {}): Promise<Response> {
  try {
    await connectSession();
    const options = { ...init, credentials: 'include' as const, signal: init.signal || AbortSignal.timeout(15000) };
    let response = await fetch(url, options);
    if (response.status === 401) {
      session = null;
      await connectSession();
      response = await fetch(url, options);
    }
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      const detail = Array.isArray(data.detail)
        ? data.detail.map((item: { loc?: string[]; msg?: string }) => `${item.loc?.slice(1).join('.')}: ${item.msg}`).join('; ')
        : data.detail;
      throw new Error(detail || `Voxera request failed (${response.status})`);
    }
    return response;
  } catch (error) {
    reportApiError(error);
    throw error;
  }
}

export interface HardwareReport {
  os_name: string;
  os_version: string;
  cpu_model: string;
  cpu_cores: number;
  ram_total_gb: number;
  ram_available_gb: number;
  gpus: Array<{
    name: string;
    driver_version?: string;
    vram_mb?: number;
    is_nvidia: boolean;
    cuda_supported: boolean;
  }>;
  has_nvidia_cuda: boolean;
  current_torch_cuda?: boolean;
  current_torch_version?: string;
  recommended_mode: string;
  current_mode?: string;
  notice?: string;
}

export interface VariantOption {
  id: string;
  name: string;
  description: string;
  size_approx: string;
  is_recommended: boolean;
}

export interface AccelerationStatus {
  current_mode: 'cuda' | 'cpu' | 'mps';
  torch_version?: string;
  cuda_available: boolean;
  has_nvidia_gpu: boolean;
  gpu_names: string[];
  recommended_variant: string;
  available_variants: VariantOption[];
  is_installing: boolean;
  install_progress: number;
  install_status: 'idle' | 'installing' | 'completed' | 'failed';
  install_step: string;
  error?: string;
}

export interface TestExternalPythonResponse {
  valid: boolean;
  python_version?: string;
  torch_version?: string;
  cuda_available: boolean;
  device_name?: string;
  error?: string;
}

export interface NetworkProfile {
  region: string;
  selected_model_source: string;
  selected_pypi_index: string;
  hf_latency_ms?: number;
  cn_latency_ms?: number;
}

export interface ModelInfo {
  id: string;
  name: string;
  version: string;
  size_display: string;
  vram_gb: number | null;
  is_default: boolean;
  is_available?: boolean;
  description: string;
  is_downloaded: boolean;
  status: string;
  percentage: number;
  is_auxiliary?: boolean;
  error?: string | null;
}

export interface CharacterItem {
  id: number;
  name: string;
  avatar: string;
  voice_description: string;
  sample_text: string;
  tags: string[];
  pinned_clip?: {
    id: number;
    audio_url: string;
    model_name: string;
    model_version: string;
    seed: number;
    duration_seconds: number;
  };
  created_at?: string;
}

export interface AuditionCandidate {
  id?: number;
  batch_id?: number;
  clientId?: string;
  candidate_index: number;
  audio_url?: string;
  duration?: number;
  waveform?: number[];
  seed?: number;
  model_name?: string;
  model_version?: string;
  generation_time_ms?: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  is_pinned?: boolean;
  prompt?: string;
  sample_text?: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

export const api = {
  async getHardware(): Promise<HardwareReport> {
    const res = await apiFetch(`${BASE_URL}/api/system/hardware`);
    return res.json();
  },

  async getAcceleration(): Promise<AccelerationStatus> {
    const res = await apiFetch(`${BASE_URL}/api/system/acceleration`);
    return res.json();
  },

  async installAcceleration(variant: string = 'cu124'): Promise<void> {
    await apiFetch(`${BASE_URL}/api/system/acceleration/install`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ variant })
    });
  },

  async testExternalPython(pythonPath: string): Promise<TestExternalPythonResponse> {
    const res = await apiFetch(`${BASE_URL}/api/system/acceleration/test-external`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ python_path: pythonPath })
    });
    return res.json();
  },

  async getNetwork(): Promise<NetworkProfile> {
    const res = await apiFetch(`${BASE_URL}/api/system/network`);
    return res.json();
  },

  async getModels(): Promise<ModelInfo[]> {
    const res = await apiFetch(`${BASE_URL}/api/models`);
    return res.json();
  },

  async downloadModel(modelKey: string, source?: string): Promise<void> {
    const url = source ? `${BASE_URL}/api/models/${modelKey}/download?source=${encodeURIComponent(source)}` : `${BASE_URL}/api/models/${modelKey}/download`;
    await apiFetch(url, { method: 'POST' });
  },

  async getModelProgress(modelKey: string): Promise<any> {
    const res = await apiFetch(`${BASE_URL}/api/models/${modelKey}/progress`);
    return res.json();
  },

  async getCharacters(): Promise<CharacterItem[]> {
    const res = await apiFetch(`${BASE_URL}/api/characters`);
    return res.json();
  },

  async createCharacter(data: { name: string; voice_description: string; sample_text: string; avatar?: string; tags?: string }): Promise<{ id: number }> {
    const res = await apiFetch(`${BASE_URL}/api/characters`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  },

  async deleteCharacter(id: number): Promise<void> {
    await apiFetch(`${BASE_URL}/api/characters/${id}`, { method: 'DELETE' });
  },

  async startGeneration(data: {
    character_id?: number;
    prompt: string;
    sample_text: string;
    model_name: string;
    candidate_count: number;
    reuse_pinned_voice?: boolean;
  }): Promise<{ batch_id: number; candidate_count: number }> {
    const res = await apiFetch(`${BASE_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  },

  async getBatchStatus(batchId: number): Promise<{
    batch_id: number;
    status: string;
    candidate_count: number;
    clips: AuditionCandidate[];
  }> {
    const res = await apiFetch(`${BASE_URL}/api/generate/${batchId}/status`);
    return res.json();
  },

  subscribeGenerationEvents(
    batchId: number,
    onEvent: (data: any) => void,
    onEnd?: () => void
  ): () => void {
    let closed = false;
    let polling = false;
    let eventSource: EventSource | null = null;
    const close = () => {
      closed = true;
      eventSource?.close();
      clearInterval(timer);
    };
    const poll = async () => {
      if (closed || polling) return;
      polling = true;
      try {
        const status = await api.getBatchStatus(batchId);
        if (closed) return;
        onEvent({ event: 'batch_status', ...status });
        if (['completed', 'partial', 'failed'].includes(status.status)) {
          close();
          onEnd?.();
        }
      } catch {
        // Remain attached while offline; the next poll can recover the task.
      } finally {
        polling = false;
      }
    };
    const timer = window.setInterval(poll, 2000);
    connectSession().then(() => {
      if (closed) return;
      eventSource = new EventSource(`${BASE_URL}/api/generate/${batchId}/events`, { withCredentials: true });
      eventSource.onmessage = event => {
        if (closed) return;
        try {
          const payload = JSON.parse(event.data);
          if (payload.event === 'batch_complete') void poll();
          else onEvent(payload);
        } catch (error) { reportApiError(error); }
      };
      eventSource.onerror = () => { eventSource?.close(); void poll(); };
      void poll();
    }).catch(reportApiError);
    return close;
  },

  async pinClip(clipId: number): Promise<void> {
    await apiFetch(`${BASE_URL}/api/auditions/${clipId}/pin`, { method: 'POST' });
  },

  async getAuditions(characterId?: number, includeAll: boolean = false): Promise<AuditionCandidate[]> {
    const params = new URLSearchParams();
    if (characterId !== undefined) params.append('character_id', String(characterId));
    if (includeAll) params.append('include_all', 'true');
    const res = await apiFetch(`${BASE_URL}/api/auditions?${params.toString()}`);
    return res.json();
  },

  async deleteAuditionClip(clipId: number): Promise<void> {
    await apiFetch(`${BASE_URL}/api/auditions/${clipId}`, { method: 'DELETE' });
  },

  async batchDeleteAuditionClips(clipIds: number[]): Promise<void> {
    await apiFetch(`${BASE_URL}/api/auditions/batch-delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clip_ids: clipIds })
    });
  },

  async clearAuditions(characterId?: number, includeAll: boolean = false): Promise<void> {
    const params = new URLSearchParams();
    if (characterId !== undefined) params.append('character_id', String(characterId));
    if (includeAll) params.append('include_all', 'true');
    await apiFetch(`${BASE_URL}/api/auditions?${params.toString()}`, { method: 'DELETE' });
  },

  async exportAuditionClip(clipId: number, fallbackName?: string): Promise<void> {
    const url = `${BASE_URL}/api/auditions/${clipId}/export`;
    const res = await apiFetch(url);
    if (!res.ok) throw new Error(`Export failed with status ${res.status}`);

    let filename = fallbackName || `Voxera_clip_${clipId}.wav`;
    const disposition = res.headers.get('content-disposition');
    if (disposition) {
      const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
      if (utf8Match && utf8Match[1]) {
        filename = decodeURIComponent(utf8Match[1]);
      } else {
        const standardMatch = disposition.match(/filename="?([^";]+)"?/i);
        if (standardMatch && standardMatch[1]) {
          filename = decodeURIComponent(standardMatch[1]);
        }
      }
    }

    const blob = await res.blob();
    const blobUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(blobUrl);
    document.body.removeChild(a);
  },

  async exportAuditionZip(clipIds?: number[], characterId?: number): Promise<void> {
    const res = await apiFetch(`${BASE_URL}/api/auditions/export-zip`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clip_ids: clipIds, character_id: characterId })
    });
    if (!res.ok) throw new Error(`Export ZIP failed with status ${res.status}`);

    let filename = `Voxera_Batch_${Date.now()}.zip`;
    const disposition = res.headers.get('content-disposition');
    if (disposition) {
      const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
      if (utf8Match && utf8Match[1]) {
        filename = decodeURIComponent(utf8Match[1]);
      } else {
        const standardMatch = disposition.match(/filename="?([^";]+)"?/i);
        if (standardMatch && standardMatch[1]) {
          filename = decodeURIComponent(standardMatch[1]);
        }
      }
    }

    const blob = await res.blob();
    const blobUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(blobUrl);
    document.body.removeChild(a);
  },

  getAudioUrl(relativeOrFilename: string): string {
    if (relativeOrFilename.startsWith('http')) return relativeOrFilename;
    return `${BASE_URL}${relativeOrFilename}`;
  }
};
