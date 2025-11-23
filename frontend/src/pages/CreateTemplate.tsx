import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Container,
  Paper,
  TextField,
  Button,
  Typography,
  Box,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  OutlinedInput,
  Checkbox,
  FormControlLabel,
  FormGroup,
} from '@mui/material';
import { templateApi } from '../services/api';
import api from '../services/api';

interface Frequency {
  id: number;
  frequency?: string;
  mode: string;
  network?: string;
  talkgroup?: string;
  description?: string;
}

const CreateTemplate: React.FC = () => {
  const { templateId } = useParams<{ templateId: string }>();
  const navigate = useNavigate();
  const isEdit = Boolean(templateId);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [frequencies, setFrequencies] = useState<Frequency[]>([]);
  const [selectedFrequencyIds, setSelectedFrequencyIds] = useState<number[]>([]);
  const [fieldConfig, setFieldConfig] = useState({
    name: { enabled: true, required: false },
    location: { enabled: true, required: false },
    skywarn_number: { enabled: false, required: false },
    weather_observation: { enabled: false, required: false },
    power_source: { enabled: false, required: false },
    feedback: { enabled: false, required: false },
    notes: { enabled: false, required: false },
  });
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    fetchFrequencies();
    if (isEdit) {
      fetchTemplateData();
    }
  }, [templateId]);

  const fetchFrequencies = async () => {
    try {
      const response = await api.get('/frequencies/');
      setFrequencies(response.data);
    } catch (error) {
      console.error('Failed to fetch frequencies:', error);
    }
  };

  const fetchTemplateData = async () => {
    if (!templateId) return;
    try {
      const response = await templateApi.get(Number(templateId));
      const template = response.data;
      setName(template.name);
      setDescription(template.description || '');
      setSelectedFrequencyIds(template.frequencies.map((f: any) => f.id));
      setFieldConfig(template.field_config || fieldConfig);
      setIsActive(template.is_active);
    } catch (error) {
      console.error('Failed to fetch template:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const templateData = {
      name,
      description,
      frequency_ids: selectedFrequencyIds,
      field_config: fieldConfig,
      is_active: isActive,
    };

    try {
      if (isEdit) {
        await templateApi.update(Number(templateId), templateData);
      } else {
        await templateApi.create(templateData);
      }
      navigate('/templates');
    } catch (error: any) {
      console.error('Failed to save template:', error);
      alert(error.response?.data?.detail || 'Failed to save template');
    }
  };

  const getFrequencyDisplay = (freq: Frequency) => {
    if (freq.frequency) {
      return `${freq.frequency} ${freq.mode}`;
    } else if (freq.network && freq.talkgroup) {
      return `${freq.network} TG${freq.talkgroup} (${freq.mode})`;
    } else if (freq.network) {
      return `${freq.network} (${freq.mode})`;
    }
    return freq.mode;
  };

  const handleFieldToggle = (field: string, property: 'enabled' | 'required') => {
    setFieldConfig(prev => ({
      ...prev,
      [field]: {
        ...prev[field as keyof typeof prev],
        [property]: !prev[field as keyof typeof prev][property]
      }
    }));
  };

  return (
    <Container maxWidth="md" sx={{ mt: 4, mb: 4 }}>
      <Paper sx={{ p: 3 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          {isEdit ? 'Edit Template' : 'Create Template'}
        </Typography>

        <Box component="form" onSubmit={handleSubmit} sx={{ mt: 3 }}>
          <TextField
            fullWidth
            label="Template Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            margin="normal"
            required
            helperText="e.g., 'Weekly SKYWARN Net', 'Monthly Emergency Preparedness Net'"
          />

          <TextField
            fullWidth
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            margin="normal"
            multiline
            rows={3}
            helperText="Optional description of the net template"
          />

          <FormControl fullWidth margin="normal">
            <InputLabel>Frequencies</InputLabel>
            <Select
              multiple
              value={selectedFrequencyIds}
              onChange={(e) => setSelectedFrequencyIds(e.target.value as number[])}
              input={<OutlinedInput label="Frequencies" />}
              renderValue={(selected) => (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {selected.map((id) => {
                    const freq = frequencies.find(f => f.id === id);
                    return freq ? (
                      <Chip key={id} label={getFrequencyDisplay(freq)} size="small" />
                    ) : null;
                  })}
                </Box>
              )}
            >
              {frequencies.map((freq) => (
                <MenuItem key={freq.id} value={freq.id}>
                  {getFrequencyDisplay(freq)}
                  {freq.description && ` - ${freq.description}`}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <Box sx={{ mt: 3, mb: 2 }}>
            <Typography variant="h6" gutterBottom>
              Check-In Field Configuration
            </Typography>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Configure which fields are available when stations check in to nets created from this template
            </Typography>
          </Box>

          <FormGroup>
            {Object.entries(fieldConfig).map(([field, config]) => (
              <Box key={field} sx={{ display: 'flex', gap: 2, alignItems: 'center', mb: 1 }}>
                <Typography sx={{ minWidth: 180, textTransform: 'capitalize' }}>
                  {field.replace(/_/g, ' ')}:
                </Typography>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={config.enabled}
                      onChange={() => handleFieldToggle(field, 'enabled')}
                    />
                  }
                  label="Enabled"
                />
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={config.required}
                      onChange={() => handleFieldToggle(field, 'required')}
                      disabled={!config.enabled}
                    />
                  }
                  label="Required"
                />
              </Box>
            ))}
          </FormGroup>

          {isEdit && (
            <FormControlLabel
              control={
                <Checkbox
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                />
              }
              label="Template is active (can be used to create nets)"
              sx={{ mt: 2 }}
            />
          )}

          <Box sx={{ display: 'flex', gap: 2, mt: 3 }}>
            <Button variant="outlined" onClick={() => navigate('/templates')}>
              Cancel
            </Button>
            <Button type="submit" variant="contained" color="primary">
              {isEdit ? 'Save Changes' : 'Create Template'}
            </Button>
          </Box>
        </Box>
      </Paper>
    </Container>
  );
};

export default CreateTemplate;
