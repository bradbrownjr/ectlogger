import React, { useState, useCallback, useEffect } from 'react';
import Cropper from 'react-easy-crop';
import type { Area } from 'react-easy-crop';
import {
  Box,
  Typography,
  Button,
  Alert,
  Stack,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Slider,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../services/api';
import { getErrorMessage } from '../../utils/apiErrors';
import UserAvatar from '../UserAvatar';

// ========== PROFILE AVATAR SECTION ==========
// The avatar display, upload/replace/remove buttons, and crop dialog on the
// Profile tab. Fully self-contained: owns its own avatar-related state and
// calls useAuth() directly (rather than taking user/login as props) since
// nothing outside this section needs that state. Extracted verbatim from
// Profile.tsx.

async function getCroppedImg(imageSrc: string, pixelCrop: Area): Promise<Blob> {
  const image = new Image();
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

const ProfileAvatarSection: React.FC = () => {
  const { user, login } = useAuth();
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const avatarInputRef = React.useRef<HTMLInputElement>(null);

  // Crop dialog state
  const [cropDialogOpen, setCropDialogOpen] = useState(false);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

  // File selected → read as data URL and open crop dialog
  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (avatarInputRef.current) avatarInputRef.current.value = '';
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

  // Crop confirmed → extract pixels via canvas → upload
  const handleCropConfirm = async () => {
    if (!imageSrc || !croppedAreaPixels) return;
    setAvatarError(null);
    setAvatarUploading(true);
    setCropDialogOpen(false);
    try {
      const blob = await getCroppedImg(imageSrc, croppedAreaPixels);
      const form = new FormData();
      form.append('file', blob, 'avatar.jpg');
      await api.post('/users/me/avatar', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const token = localStorage.getItem('token');
      if (token) await login(token);
    } catch (err: any) {
      setAvatarError(getErrorMessage(err, 'Upload failed.'));
    } finally {
      setAvatarUploading(false);
      setImageSrc(null);
    }
  };

  // Whether this instance uses Gravatar at all (Admin -> Security -> Profile
  // Photos). Read from the public branding endpoint so the copy below never
  // offers a service the instance has disabled. Defaults to true so a failed
  // request leaves the existing wording rather than hiding a working feature.
  const [gravatarEnabled, setGravatarEnabled] = useState(true);
  useEffect(() => {
    api.get('/settings/theme')
      .then((r) => setGravatarEnabled(r.data?.gravatar_enabled ?? true))
      .catch(() => { /* keep the default */ });
  }, []);

  const handleAvatarDelete = async () => {
    setAvatarError(null);
    setAvatarUploading(true);
    try {
      await api.delete('/users/me/avatar');
      const token = localStorage.getItem('token');
      if (token) await login(token);
    } catch (_err: any) {
      setAvatarError('Failed to remove photo.');
    } finally {
      setAvatarUploading(false);
    }
  };

  return (
    <>
      {/* Profile photo section */}
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mb: 3, p: 3, border: 1, borderColor: 'divider', borderRadius: 1 }}>
        <UserAvatar avatarUrl={(user as any)?.avatar_url} callsign={user?.callsign} name={user?.name} size={120} />
        <Typography variant="subtitle2" sx={{ mt: 2 }}>Profile Photo</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2, textAlign: 'center' }}>
          {(user as any)?.avatar_url?.startsWith('/api/avatars/')
            ? 'Using uploaded photo'
            : gravatarEnabled
              ? 'Using Gravatar if available, otherwise your initials'
              : 'Using your initials'}
        </Typography>
        {avatarError && <Alert severity="error" sx={{ mb: 1, py: 0, width: '100%' }}>{avatarError}</Alert>}
        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', justifyContent: 'center', gap: 1 }}>
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            style={{ display: 'none' }}
            onChange={handleAvatarUpload}
          />
          <Button
            variant="outlined"
            startIcon={avatarUploading ? <CircularProgress size={16} /> : <PhotoCameraIcon />}
            onClick={() => avatarInputRef.current?.click()}
            disabled={avatarUploading}
          >
            {(user as any)?.avatar_url?.startsWith('/api/avatars/') ? 'Replace Photo' : 'Upload Photo'}
          </Button>
          {(user as any)?.avatar_url?.startsWith('/api/avatars/') && (
            <Button
              variant="outlined"
              color="error"
              startIcon={<DeleteIcon />}
              onClick={handleAvatarDelete}
              disabled={avatarUploading}
            >
              Remove
            </Button>
          )}
        </Stack>
      </Box>

      {/* ========== CROP DIALOG ========== */}
      <Dialog open={cropDialogOpen} onClose={() => setCropDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Crop Profile Photo</DialogTitle>
        <DialogContent sx={{ p: 0 }}>
          {imageSrc && (
            <>
              <Box sx={{ position: 'relative', width: '100%', height: 360, bgcolor: 'black' }}>
                <Cropper
                  image={imageSrc}
                  crop={crop}
                  zoom={zoom}
                  aspect={1}
                  cropShape="round"
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

export default ProfileAvatarSection;
