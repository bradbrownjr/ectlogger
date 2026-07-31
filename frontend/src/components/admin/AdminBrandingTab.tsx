import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  CircularProgress,
  TextField,
  ToggleButtonGroup,
  ToggleButton,
  Divider,
} from '@mui/material';
import BrandingWatermarkIcon from '@mui/icons-material/BrandingWatermark';
import LightModeIcon from '@mui/icons-material/LightMode';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import api from '../../services/api';
import ThemeSwatchPicker from '../ThemeSwatchPicker';
import AppLogo from '../AppLogo';
import { useThemeMode } from '../../contexts/ThemeContext';
import { DEFAULT_THEME_KEY, ThemeVariant } from '../../theme/themes';

interface Props {
  showSnackbar: (message: string, severity: 'success' | 'error') => void;
}

const DEFAULT_CUSTOM_VARIANT_LIGHT: ThemeVariant = { primary: '#1976d2', secondary: '#dc004e', background: '#e8eef4', paper: '#ffffff' };
const DEFAULT_CUSTOM_VARIANT_DARK: ThemeVariant = { primary: '#90caf9', secondary: '#f48fb1', background: '#121212', paper: '#1e1e1e' };

const ColorField: React.FC<{ label: string; value: string; onChange: (hex: string) => void }> = ({ label, value, onChange }) => (
  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
    <input
      type="color"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{ width: 36, height: 36, border: 'none', borderRadius: 4, cursor: 'pointer', padding: 0, background: 'none' }}
    />
    <TextField
      label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      size="small"
      sx={{ width: 130 }}
      inputProps={{ maxLength: 7, style: { fontFamily: 'monospace' } }}
    />
  </Box>
);

const AdminBrandingTab: React.FC<Props> = ({ showSnackbar }) => {
  // setSystemDefaultTheme/setCustomTheme/setCustomLogoUrl reflect a
  // successful save into the current admin's own session immediately,
  // without waiting for a reload or the next poll.
  const { systemDefaultTheme, setSystemDefaultTheme, customTheme, setCustomTheme, customLogoUrl, setCustomLogoUrl } = useThemeMode();

  // ---- Default theme ----
  const [selectedTheme, setSelectedTheme] = useState<string>(DEFAULT_THEME_KEY);
  const [themeSaving, setThemeSaving] = useState(false);

  // ---- Default appearance (light/dark) ----
  const [defaultColorMode, setDefaultColorMode] = useState<'light' | 'dark'>('light');
  const [appearanceSaving, setAppearanceSaving] = useState(false);

  // ---- Custom theme ----
  const [customName, setCustomName] = useState('Custom');
  const [customLight, setCustomLight] = useState<ThemeVariant>(DEFAULT_CUSTOM_VARIANT_LIGHT);
  const [customDark, setCustomDark] = useState<ThemeVariant>(DEFAULT_CUSTOM_VARIANT_DARK);
  const [customThemeSaving, setCustomThemeSaving] = useState(false);

  // ---- Logo ----
  const [logoUploading, setLogoUploading] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/settings')
      .then((res) => {
        const data = res.data;
        setSelectedTheme(data.default_theme ?? DEFAULT_THEME_KEY);
        setDefaultColorMode(data.default_color_mode === 'dark' ? 'dark' : 'light');
        if (data.custom_theme) {
          setCustomName(data.custom_theme.name ?? 'Custom');
          setCustomLight(data.custom_theme.light);
          setCustomDark(data.custom_theme.dark);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSaveTheme = async () => {
    setThemeSaving(true);
    try {
      await api.put('/settings', { default_theme: selectedTheme });
      setSystemDefaultTheme(selectedTheme);
      showSnackbar('System default theme updated', 'success');
    } catch (error: any) {
      showSnackbar(error.response?.data?.detail || 'Failed to save theme', 'error');
    } finally {
      setThemeSaving(false);
    }
  };

  const handleSaveAppearance = async () => {
    setAppearanceSaving(true);
    try {
      await api.put('/settings', { default_color_mode: defaultColorMode });
      showSnackbar('Default appearance updated. Applies only to visitors who have never toggled light/dark before.', 'success');
    } catch (error: any) {
      showSnackbar(error.response?.data?.detail || 'Failed to save default appearance', 'error');
    } finally {
      setAppearanceSaving(false);
    }
  };

  const handleSaveCustomTheme = async () => {
    setCustomThemeSaving(true);
    const payload = { name: customName, light: customLight, dark: customDark };
    try {
      await api.put('/settings', { custom_theme: payload });
      setCustomTheme(payload);
      showSnackbar('Custom theme saved', 'success');
    } catch (error: any) {
      showSnackbar(error.response?.data?.detail || 'Failed to save custom theme', 'error');
    } finally {
      setCustomThemeSaving(false);
    }
  };

  const handleClearCustomTheme = async () => {
    setCustomThemeSaving(true);
    try {
      await api.put('/settings', { custom_theme: null });
      setCustomTheme(null);
      setCustomName('Custom');
      setCustomLight(DEFAULT_CUSTOM_VARIANT_LIGHT);
      setCustomDark(DEFAULT_CUSTOM_VARIANT_DARK);
      showSnackbar('Custom theme cleared', 'success');
    } catch (error: any) {
      showSnackbar(error.response?.data?.detail || 'Failed to clear custom theme', 'error');
    } finally {
      setCustomThemeSaving(false);
    }
  };

  const handleLogoFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (logoInputRef.current) logoInputRef.current.value = '';
    if (!file) return;

    setLogoUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await api.post('/settings/logo', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setCustomLogoUrl(res.data.custom_logo_url);
      showSnackbar('Logo uploaded', 'success');
    } catch (error: any) {
      showSnackbar(error.response?.data?.detail || 'Failed to upload logo', 'error');
    } finally {
      setLogoUploading(false);
    }
  };

  const handleLogoReset = async () => {
    setLogoUploading(true);
    try {
      await api.delete('/settings/logo');
      setCustomLogoUrl(null);
      showSnackbar('Reverted to the default logo', 'success');
    } catch (error: any) {
      showSnackbar(error.response?.data?.detail || 'Failed to reset logo', 'error');
    } finally {
      setLogoUploading(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <>
      {/* ========== BRANDING TAB ========== */}
      <Typography variant="h6" gutterBottom>
        <BrandingWatermarkIcon sx={{ verticalAlign: 'middle', mr: 1 }} />
        Branding
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Customize how this instance looks: the default color theme and light/dark
        appearance for visitors, an optional fully custom theme, and the app's logo.
      </Typography>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {/* ---- Default theme ---- */}
        <Card variant="outlined">
          <CardContent>
            <Typography variant="subtitle1" gutterBottom>Default Theme</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Users who haven't picked a personal theme (Profile → Settings) follow this
              default; changing it takes effect for them immediately.
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <ThemeSwatchPicker value={selectedTheme} onSelect={(key) => key && setSelectedTheme(key)} />
              <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Button
                  variant="contained"
                  onClick={handleSaveTheme}
                  disabled={themeSaving || selectedTheme === systemDefaultTheme}
                  startIcon={themeSaving ? <CircularProgress size={20} /> : null}
                >
                  {themeSaving ? 'Saving...' : 'Set as System Default'}
                </Button>
              </Box>
            </Box>
          </CardContent>
        </Card>

        {/* ---- Default appearance ---- */}
        <Card variant="outlined">
          <CardContent>
            <Typography variant="subtitle1" gutterBottom>Default Appearance</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Light or dark mode for a visitor's very first visit, before they've made a
              choice of their own. Once someone toggles light/dark, their own browser
              remembers that choice from then on — this only affects brand-new visitors.
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <ToggleButtonGroup
                value={defaultColorMode}
                exclusive
                onChange={(_, v) => v && setDefaultColorMode(v)}
                size="small"
              >
                <ToggleButton value="light"><LightModeIcon fontSize="small" sx={{ mr: 1 }} />Light</ToggleButton>
                <ToggleButton value="dark"><DarkModeIcon fontSize="small" sx={{ mr: 1 }} />Dark</ToggleButton>
              </ToggleButtonGroup>
              <Button
                variant="contained"
                onClick={handleSaveAppearance}
                disabled={appearanceSaving}
                startIcon={appearanceSaving ? <CircularProgress size={20} /> : null}
              >
                {appearanceSaving ? 'Saving...' : 'Save'}
              </Button>
            </Box>
          </CardContent>
        </Card>

        {/* ---- Custom theme ---- */}
        <Card variant="outlined">
          <CardContent>
            <Typography variant="subtitle1" gutterBottom>Custom Theme</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Define your own light/dark color pair instead of picking from the curated
              set above. Once saved, it appears as an extra "{customName || 'Custom'}" swatch
              in both this page and Profile → Settings.
            </Typography>
            <TextField
              label="Theme name"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              size="small"
              sx={{ mb: 2, width: 240 }}
            />
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              <Box>
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>Light</Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  <ColorField label="Primary" value={customLight.primary} onChange={(v) => setCustomLight({ ...customLight, primary: v })} />
                  <ColorField label="Secondary" value={customLight.secondary} onChange={(v) => setCustomLight({ ...customLight, secondary: v })} />
                  <ColorField label="Background" value={customLight.background} onChange={(v) => setCustomLight({ ...customLight, background: v })} />
                  <ColorField label="Paper" value={customLight.paper} onChange={(v) => setCustomLight({ ...customLight, paper: v })} />
                </Box>
              </Box>
              <Divider orientation="vertical" flexItem />
              <Box>
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>Dark</Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  <ColorField label="Primary" value={customDark.primary} onChange={(v) => setCustomDark({ ...customDark, primary: v })} />
                  <ColorField label="Secondary" value={customDark.secondary} onChange={(v) => setCustomDark({ ...customDark, secondary: v })} />
                  <ColorField label="Background" value={customDark.background} onChange={(v) => setCustomDark({ ...customDark, background: v })} />
                  <ColorField label="Paper" value={customDark.paper} onChange={(v) => setCustomDark({ ...customDark, paper: v })} />
                </Box>
              </Box>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2, mt: 2 }}>
              {customTheme && (
                <Button variant="outlined" color="warning" onClick={handleClearCustomTheme} disabled={customThemeSaving}>
                  Clear
                </Button>
              )}
              <Button
                variant="contained"
                onClick={handleSaveCustomTheme}
                disabled={customThemeSaving}
                startIcon={customThemeSaving ? <CircularProgress size={20} /> : null}
              >
                {customThemeSaving ? 'Saving...' : customTheme ? 'Update Custom Theme' : 'Save Custom Theme'}
              </Button>
            </Box>
          </CardContent>
        </Card>

        {/* ---- Logo ---- */}
        <Card variant="outlined">
          <CardContent>
            <Typography variant="subtitle1" gutterBottom>Logo</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Replace the built-in ECTLogger mark with your own. PNG, JPEG, WebP, or SVG,
              up to 2 MB. Applies everywhere the logo appears (login, navbar, About).
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <AppLogo size={64} variant="default" />
              <input
                ref={logoInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                hidden
                onChange={handleLogoFileSelected}
              />
              <Button
                variant="outlined"
                startIcon={logoUploading ? <CircularProgress size={16} /> : <UploadFileIcon />}
                onClick={() => logoInputRef.current?.click()}
                disabled={logoUploading}
              >
                {customLogoUrl ? 'Replace Logo' : 'Upload Logo'}
              </Button>
              {customLogoUrl && (
                <Button
                  variant="outlined"
                  color="warning"
                  startIcon={<RestartAltIcon />}
                  onClick={handleLogoReset}
                  disabled={logoUploading}
                >
                  Reset to Default
                </Button>
              )}
            </Box>
          </CardContent>
        </Card>
      </Box>
    </>
  );
};

export default AdminBrandingTab;
