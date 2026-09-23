import { useEffect, useRef, useState } from 'react';
import { Archive, Trash2, Upload } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardContent } from '../components/ui/card';
import { ErrorState } from '../components/ui/error-state';
import {
  ApiError,
  listMediaAssets,
  uploadMediaAsset,
  archiveMediaAsset,
  deleteMediaAsset,
  getMediaAssetUsage,
  loadMediaAssetBlobUrl,
  type MediaAsset,
  type MediaAssetUsageSummary,
} from '../lib/api';

// Marketing -> Biblioteca de Mídia: central place to upload, tag and
// browse reusable media assets. Proposal/Offer/Communication only
// *select* from here (MediaAssetPicker) -- they never own the file.
// See docs/product/MEDIA_LIBRARY.md.
export function MediaLibraryPage() {
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  const reload = () => {
    setLoading(true);
    setError(null);
    listMediaAssets({
      ...(search ? { search } : {}),
      status: showArchived ? 'ARCHIVED' : 'ACTIVE',
    })
      .then(setAssets)
      .catch((err: unknown) => setError(err instanceof ApiError ? err.message : 'Erro ao carregar a biblioteca.'))
      .finally(() => setLoading(false));
  };

  useEffect(reload, [search, showArchived]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Biblioteca de Mídia</h1>
          <p className="text-sm text-slate-500">
            Imagens administradas pelo Marketing, reutilizáveis em Propostas, Ofertas e Comunicações.
          </p>
        </div>
        <UploadButton onUploaded={reload} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Buscar por título ou tag..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          Mostrar arquivadas
        </label>
      </div>

      {error && <ErrorState description={error} />}
      {loading && <p className="text-sm text-slate-500">Carregando...</p>}
      {!loading && assets.length === 0 && (
        <p className="text-sm text-slate-500">Nenhuma imagem encontrada.</p>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {assets.map((asset) => (
          <MediaAssetCard key={asset.id} asset={asset} onChanged={reload} />
        ))}
      </div>
    </div>
  );
}

function UploadButton({ onUploaded }: { onUploaded: () => void }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  async function handleFile(file: File) {
    setUploading(true);
    setError(null);
    try {
      await uploadMediaAsset(file, { title: file.name });
      onUploaded();
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : 'Erro ao enviar imagem.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
        className="gap-2"
      >
        <Upload className="h-4 w-4" />
        {uploading ? 'Enviando...' : 'Enviar imagem'}
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/jpg,image/webp"
        className="hidden"
        disabled={uploading}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
          e.target.value = '';
        }}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function MediaAssetCard({ asset, onChanged }: { asset: MediaAsset; onChanged: () => void }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [usage, setUsage] = useState<MediaAssetUsageSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadMediaAssetBlobUrl(asset.id)
      .then((url: string) => {
        if (!cancelled) setBlobUrl(url);
      })
      .catch(() => undefined);
    getMediaAssetUsage(asset.id)
      .then((u) => {
        if (!cancelled) setUsage(u);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [asset.id]);

  const totalUses = usage.reduce((sum, u) => sum + u.count, 0);

  async function handleArchive() {
    setBusy(true);
    setError(null);
    try {
      await archiveMediaAsset(asset.id);
      onChanged();
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : 'Erro ao arquivar.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    setBusy(true);
    setError(null);
    try {
      await deleteMediaAsset(asset.id);
      onChanged();
    } catch (err: unknown) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Não foi possível excluir. Se estiver em uso, arquive em vez de excluir.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardContent className="space-y-2 p-3">
        {blobUrl ? (
          <img src={blobUrl} alt={asset.altText ?? asset.title} className="h-32 w-full rounded object-cover" />
        ) : (
          <div className="h-32 w-full animate-pulse rounded bg-slate-100" />
        )}
        <p className="truncate text-sm font-medium text-slate-900">{asset.title}</p>
        {asset.tags.length > 0 && (
          <p className="truncate text-xs text-slate-500">{asset.tags.join(', ')}</p>
        )}
        <p className="text-xs text-slate-400">
          Usado em: {totalUses === 0 ? 'nenhum lugar' : usage.map((u) => `${u.count} ${u.entityType}`).join(', ')}
        </p>
        {error && <p className="text-xs text-destructive">{error}</p>}
        {asset.status === 'ACTIVE' && (
          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void handleArchive()}>
              <Archive className="mr-1 h-3.5 w-3.5" /> Arquivar
            </Button>
            {totalUses === 0 && (
              <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void handleDelete()}>
                <Trash2 className="mr-1 h-3.5 w-3.5" /> Excluir
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
