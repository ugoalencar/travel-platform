import { useEffect, useState } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import {
  listMediaAssets,
  uploadMediaAsset,
  loadMediaAssetBlobUrl,
  type MediaAsset,
} from '../../lib/api';

// Reusable "Selecionar da biblioteca" picker used by Proposal, Offer and
// Communication editors. Media Library is administered centrally
// (Marketing) -- features consume it, they do not each own an upload
// silo. New uploads still go through this picker so the asset always
// lands in the library first (see docs/product/MEDIA_LIBRARY.md).
export interface MediaAssetPickerProps {
  open: boolean;
  onClose: () => void;
  onSelect: (asset: MediaAsset) => void | Promise<void>;
}

export function MediaAssetPicker({ open, onClose, onSelect }: MediaAssetPickerProps) {
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [uploading, setUploading] = useState(false);

  const reload = () => {
    setLoading(true);
    setError(null);
    listMediaAssets(search ? { search } : {})
      .then(setAssets)
      .catch(() => setError('Não foi possível carregar a biblioteca de mídia.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!open) return;
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, search]);

  if (!open) return null;

  const handleUpload = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const asset = await uploadMediaAsset(file, { title: file.name });
      await onSelect(asset);
      onClose();
    } catch {
      setError('Não foi possível enviar a imagem para a biblioteca.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[80vh] w-full max-w-3xl flex-col rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 p-4">
          <h2 className="text-lg font-bold text-slate-900">Biblioteca de Mídia</h2>
          <Button variant="ghost" onClick={onClose}>Fechar</Button>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 p-4">
          <Input
            placeholder="Buscar por título ou tag..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
          <label className="cursor-pointer rounded-md border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">
            {uploading ? 'Enviando...' : 'Enviar nova imagem'}
            <input
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/webp"
              className="hidden"
              disabled={uploading}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleUpload(file);
                e.target.value = '';
              }}
            />
          </label>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading && <p className="text-sm text-slate-500">Carregando...</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}
          {!loading && assets.length === 0 && (
            <p className="text-sm text-slate-500">Nenhuma imagem na biblioteca ainda. Envie a primeira.</p>
          )}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {assets.map((asset) => (
              <MediaAssetCard
                key={asset.id}
                asset={asset}
                onPick={() => void Promise.resolve(onSelect(asset)).then(onClose)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function MediaAssetCard({ asset, onPick }: { asset: MediaAsset; onPick: () => void }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadMediaAssetBlobUrl(asset.id)
      .then((url: string) => {
        if (!cancelled) setBlobUrl(url);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [asset.id]);

  return (
    <button
      type="button"
      onClick={onPick}
      className="group flex flex-col overflow-hidden rounded-lg border border-slate-200 text-left hover:border-blue-400"
    >
      {blobUrl ? (
        <img src={blobUrl} alt={asset.altText ?? asset.title} className="h-24 w-full object-cover" />
      ) : (
        <div className="h-24 w-full animate-pulse bg-slate-100" />
      )}
      <div className="p-2">
        <p className="truncate text-xs font-medium text-slate-800">{asset.title}</p>
        {asset.tags.length > 0 && (
          <p className="truncate text-xs text-slate-500">{asset.tags.join(', ')}</p>
        )}
      </div>
    </button>
  );
}
