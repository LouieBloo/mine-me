import { useEffect, useState, useCallback } from 'react';
import { useToast } from '../../contexts/ToastContext';
import LoadingSpinner from '../../components/LoadingSpinner/LoadingSpinner';
import { useApi } from '../../hooks/useApi';
import { DEFAULT_MINING_MAP_CONFIG, type MiningMapConfigData } from '@mine-me/shared';
import MiningConfigHeader from './components/MiningConfigHeader/MiningConfigHeader';
import MiningConfigPresets, { PRESETS } from './components/MiningConfigPresets/MiningConfigPresets';
import MiningConfigCaverns from './components/MiningConfigCaverns/MiningConfigCaverns';
import MiningConfigResources from './components/MiningConfigResources/MiningConfigResources';
import MiningConfigMobs from './components/MiningConfigMobs/MiningConfigMobs';
import MiningConfigPreview, { type PreviewResponse } from './components/MiningConfigPreview/MiningConfigPreview';
import './MiningConfig.css';

export default function MiningConfig() {
  const [config, setConfig] = useState<MiningMapConfigData>(DEFAULT_MINING_MAP_CONFIG);
  const [seed, setSeed] = useState<number>(() => Math.floor(Math.random() * 1000000));
  const [previewData, setPreviewData] = useState<PreviewResponse | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toast = useToast();
  const { fetchWithAuth } = useApi();

  const fetchPreview = useCallback(async (targetConfig: MiningMapConfigData, targetSeed: number) => {
    setPreviewing(true);
    try {
      const res = await fetchWithAuth('/api/admin/mining-config/preview', {
        method: 'POST',
        body: JSON.stringify({
          seed: targetSeed,
          config: targetConfig,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to generate preview');
      }
      const data: PreviewResponse = await res.json();
      setPreviewData(data);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setPreviewing(false);
    }
  }, [fetchWithAuth, toast]);

  useEffect(() => {
    fetchWithAuth('/api/admin/mining-config')
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch mining configuration');
        return res.json();
      })
      .then((data: MiningMapConfigData) => {
        setConfig(data);
        setError(null);
        setLoading(false);
        fetchPreview(data, seed);
      })
      .catch(err => {
        setError(err.message);
        toast.error(err.message);
        setLoading(false);
      });
  }, []);

  const handleFieldChange = <K extends keyof MiningMapConfigData>(field: K, value: MiningMapConfigData[K]) => {
    setConfig(prev => ({ ...prev, [field]: value }));
  };

  const handleApplyPreset = (presetName: string) => {
    const preset = PRESETS[presetName];
    if (!preset) return;
    const updated = { ...config, ...preset };
    setConfig(updated);
    fetchPreview(updated, seed);
    toast.success(`Applied preset: ${presetName}`);
  };

  const handleRandomizeSeed = () => {
    const newSeed = Math.floor(Math.random() * 2147483647);
    setSeed(newSeed);
    fetchPreview(config, newSeed);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetchWithAuth('/api/admin/mining-config', {
        method: 'PUT',
        body: JSON.stringify(config),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save configuration');
      }
      const updated = await res.json();
      setConfig(updated);
      toast.success('Mining map configuration saved successfully!');
    } catch (err: any) {
      setError(err.message);
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!window.confirm('Reset all map generator settings back to balanced defaults?')) return;
    setResetting(true);
    setError(null);
    try {
      const res = await fetchWithAuth('/api/admin/mining-config/reset', {
        method: 'POST',
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to reset configuration');
      }
      const reset = await res.json();
      setConfig(reset);
      fetchPreview(reset, seed);
      toast.success('Reset mining map configuration to default!');
    } catch (err: any) {
      setError(err.message);
      toast.error(err.message);
    } finally {
      setResetting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-32">
        <LoadingSpinner size={64} />
      </div>
    );
  }

  return (
    <div className="mining-config-page space-y-6 pb-12">
      <MiningConfigHeader
        saving={saving}
        resetting={resetting}
        error={error}
        onSave={handleSave}
        onReset={handleReset}
        onDismissError={() => setError(null)}
      />

      <MiningConfigPresets onApplyPreset={handleApplyPreset} />

      {/* Main Grid: Controls Left, Live Preview Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Form Controls */}
        <div className="lg:col-span-7 space-y-6">
          <MiningConfigCaverns config={config} onFieldChange={handleFieldChange} />
          <MiningConfigResources config={config} onFieldChange={handleFieldChange} />
          <MiningConfigMobs config={config} onFieldChange={handleFieldChange} />
        </div>

        {/* Right Column: Live Visual Mini-Map Preview */}
        <div className="lg:col-span-5 space-y-6">
          <MiningConfigPreview
            config={config}
            seed={seed}
            onSeedChange={setSeed}
            previewData={previewData}
            previewing={previewing}
            onRefreshPreview={() => fetchPreview(config, seed)}
            onRandomizeSeed={handleRandomizeSeed}
          />
        </div>
      </div>
    </div>
  );
}
