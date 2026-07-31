import React, { useState, useEffect } from 'react';
import { Box, Typography, Card, CardContent, Button, CircularProgress } from '@mui/material';
import PaletteIcon from '@mui/icons-material/Palette';
import api from '../../services/api';
import ThemeSwatchPicker from '../ThemeSwatchPicker';
import { useThemeMode } from '../../contexts/ThemeContext';
import { DEFAULT_THEME_KEY } from '../../theme/themes';

interface Props {
  showSnackbar: (message: string, severity: 'success' | 'error') => void;
}

const AdminThemeTab: React.FC<Props> = ({ showSnackbar }) => {
  // setSystemDefaultTheme reflects a successful save into the current admin's
  // own session immediately, without waiting for a reload or the next poll.
  const { systemDefaultTheme, setSystemDefaultTheme } = useThemeMode();
  const [selected, setSelected] = useState<string>(DEFAULT_THEME_KEY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/settings')
      .then((res) => setSelected(res.data.default_theme ?? DEFAULT_THEME_KEY))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put('/settings', { default_theme: selected });
      setSystemDefaultTheme(selected);
      showSnackbar('System default theme updated', 'success');
    } catch (error: any) {
      showSnackbar(error.response?.data?.detail || 'Failed to save theme', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {/* ========== THEMES TAB ========== */}
      <Typography variant="h6" gutterBottom>
        <PaletteIcon sx={{ verticalAlign: 'middle', mr: 1 }} />
        Themes
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Set the system-wide default color theme. Users who haven't picked a personal theme
        (Profile → Settings) follow this default; changing it takes effect for them immediately.
      </Typography>

      <Card variant="outlined">
        <CardContent>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
              <CircularProgress size={24} />
            </Box>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <ThemeSwatchPicker value={selected} onSelect={(key) => key && setSelected(key)} />
              <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Button
                  variant="contained"
                  onClick={handleSave}
                  disabled={saving || selected === systemDefaultTheme}
                  startIcon={saving ? <CircularProgress size={20} /> : null}
                >
                  {saving ? 'Saving...' : 'Set as System Default'}
                </Button>
              </Box>
            </Box>
          )}
        </CardContent>
      </Card>
    </>
  );
};

export default AdminThemeTab;
