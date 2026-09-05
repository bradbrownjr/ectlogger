import React, { useCallback, useState } from 'react';
import Cropper from 'react-easy-crop';
import type { Area } from 'react-easy-crop';
import {
  Box,
  Typography,
  Button,
  Alert,
  Stack,
  Avatar,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Slider,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera';
import ImageIcon from '@mui/icons-material/Image';
import { netApi, templateApi } from '../services/api';
import { getErrorMessage } from '../utils/apiErrors';

// ========== NET / SCHEDULE LOGO SECTION ==========
// Upload/replace/remove control for a net's or schedule's logo, shown on the
// Basic Info tab of the net/schedule edit screen once the entity has been
// saved (an id is required -- the upload endpoint is POST /nets/{id}/logo or
// /templates/{id}/logo). Square crop, same crop-dialog pattern as
// ProfileAvatarSection.tsx, but cropShape="rect" (not "round") so a net logo
// reads as a badge, distinct from circular user avatars.

async function getCroppedImg(imageSrc: string, pixelCrop: Area): Promise<Blob> {
  const image = new window.Image();
  image.src = imageSrc;
  await new Promise<void>((resolve) => { image.onload = () => resolve(); });
  const canvas = document.createElement('canvas');
  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(image, pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height, 0, 0, pixelCrop.width, pixelCrop.height);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Canvas is empty')), 'image/jpeg', 0.95);
  });
}

interface NetLogoSectionProps {
  entityType: 'net' | 'template';
  entityId: number;
  logoUrl: string | null | undefined;
  onLogoChange: (logoUrl: string | null) => void;
}

const NetLogoSection: React.FC<NetLogoSectionProps> = ({ entityType, entityId, logoUrl, onLogoChange }) => {
  const api = entityType === 'net' ? netApi : templateApi;
  const label = entityType === 'net' ? 'Net Logo' : 'Schedule Logo';

  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const [cropDialogOpen, setCropDialogOpen] = useState(false);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (fileInputRef.current) fileInputRef.current.value = '';
    const reader = new FileReader();
    reader.onload = () => {
      setImageSrc(reader.result as string);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setCroppedAreaPixels(null);
      setCropDialogOpen(true);
    };
    reader.readAsDataURL(file);
  };

  const onCropComplete = useCallback((_: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  }, []);

  const handleCropConfirm = async () => {
    if (!imageSrc || !croppedAreaPixels) return;
    setError(null);
    setUploading(true);
    setCropDialogOpen(false);
    try {
      const blob = await getCroppedImg(imageSrc, croppedAreaPixels);
      const response = await api.uploadLogo(entityId, blob);
      onLogoChange(response.data.logo_url ?? null);
    } catch (err: any) {
      setError(getErrorMessage(err, 'Upload failed.'));
    } finally {
      setUploading(false);
      setImageSrc(null);
    }
  };

  const handleDelete = async () => {
    setError(null);
    setUploading(true);
    try {
      const response = await api.deleteLogo(entityId);
      onLogoChange(response.data.logo_url ?? null);
    } catch (_err: any) {
      setError('Failed to remove logo.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mb: 3, p: 3, border: 1, borderColor: 'divider', borderRadius: 1 }}>
        <Avatar variant="rounded" src={logoUrl ?? undefined} sx={{ width: 96, height: 96, bgcolor: 'action.hover' }}>
          <ImageIcon sx={{ fontSize: 40, color: 'text.disabled' }} />
        </Avatar>
        <Typography variant="subtitle2" sx={{ mt: 2 }}>{label}</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2, textAlign: 'center' }}>
          {logoUrl ? 'Shown on cards and the check-in page' : 'Optional club or net logo'}
        </Typography>
        {error && <Alert severity="error" sx={{ mb: 1, py: 0, width: '100%' }}>{error}</Alert>}
        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', justifyContent: 'center', gap: 1 }}>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            style={{ display: 'none' }}
            onChange={handleFileSelected}
          />
          <Button
            variant="outlined"
            startIcon={uploading ? <CircularProgress size={16} /> : <PhotoCameraIcon />}
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {logoUrl ? 'Replace Logo' : 'Upload Logo'}
          </Button>
          {logoUrl && (
            <Button
              variant="outlined"
              color="error"
              startIcon={<DeleteIcon />}
              onClick={handleDelete}
              disabled={uploading}
            >
              Remove
            </Button>
          )}
        </Stack>
      </Box>

      <Dialog open={cropDialogOpen} onClose={() => setCropDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Crop {label}</DialogTitle>
        <DialogContent sx={{ p: 0 }}>
          {imageSrc && (
            <>
              <Box sx={{ position: 'relative', width: '100%', height: 360, bgcolor: 'black' }}>
                <Cropper
                  image={imageSrc}
                  crop={crop}
                  zoom={zoom}
                  aspect={1}
                  cropShape="rect"
                  showGrid={false}
                  onCropChange={setCrop}
                  onZoomChange={setZoom}
                  onCropComplete={onCropComplete}
                />
              </Box>
              <Box sx={{ px: 3, pt: 2, pb: 1 }}>
                <Typography variant="body2" color="text.secondary" gutterBottom>Zoom</Typography>
                <Slider
                  value={zoom}
                  min={1}
                  max={3}
                  step={0.05}
                  onChange={(_, val) => setZoom(val as number)}
                />
              </Box>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setCropDialogOpen(false); setImageSrc(null); }}>Cancel</Button>
          <Button variant="contained" onClick={handleCropConfirm} disabled={!croppedAreaPixels}>
            Crop &amp; Upload
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default NetLogoSection;
