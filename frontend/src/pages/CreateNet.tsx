import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container,
  Paper,
  Typography,
  Box,
  TextField,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  IconButton,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import { netApi, frequencyApi } from '../services/api';

interface Frequency {
  id: number;
  frequency: string;
  mode: string;
  description?: string;
}

const CreateNet: React.FC = () => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [frequencies, setFrequencies] = useState<Frequency[]>([]);
  const [selectedFrequencies, setSelectedFrequencies] = useState<number[]>([]);
  const [newFrequency, setNewFrequency] = useState({ frequency: '', mode: 'FM' });
  const [showNewFrequency, setShowNewFrequency] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    fetchFrequencies();
  }, []);

  const fetchFrequencies = async () => {
    try {
      const response = await frequencyApi.list();
      setFrequencies(response.data);
    } catch (error) {
      console.error('Failed to fetch frequencies:', error);
    }
  };

  const handleAddFrequency = async () => {
    try {
      const response = await frequencyApi.create(newFrequency);
      setFrequencies([...frequencies, response.data]);
      setSelectedFrequencies([...selectedFrequencies, response.data.id]);
      setNewFrequency({ frequency: '', mode: 'FM' });
      setShowNewFrequency(false);
    } catch (error) {
      console.error('Failed to create frequency:', error);
    }
  };

  const handleCreateNet = async () => {
    try {
      const response = await netApi.create({
        name,
        description,
        frequency_ids: selectedFrequencies,
      });
      navigate(`/nets/${response.data.id}`);
    } catch (error) {
      console.error('Failed to create net:', error);
    }
  };

  return (
    <Container maxWidth="md" sx={{ mt: 4, mb: 4 }}>
      <Paper sx={{ p: 3 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          Create New Net
        </Typography>

        <Box sx={{ mt: 3 }}>
          <TextField
            fullWidth
            label="Net Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            margin="normal"
            required
          />

          <TextField
            fullWidth
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            margin="normal"
            multiline
            rows={3}
          />

          <Typography variant="h6" sx={{ mt: 3, mb: 2 }}>
            Communication Plan
          </Typography>

          <FormControl fullWidth margin="normal">
            <InputLabel>Select Frequencies</InputLabel>
            <Select
              multiple
              value={selectedFrequencies}
              onChange={(e) => setSelectedFrequencies(e.target.value as number[])}
              renderValue={(selected) => (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {(selected as number[]).map((value) => {
                    const freq = frequencies.find((f) => f.id === value);
                    return freq ? (
                      <Chip key={value} label={`${freq.frequency} ${freq.mode}`} />
                    ) : null;
                  })}
                </Box>
              )}
            >
              {frequencies.map((freq) => (
                <MenuItem key={freq.id} value={freq.id}>
                  {freq.frequency} {freq.mode} {freq.description && `- ${freq.description}`}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {!showNewFrequency ? (
            <Button
              startIcon={<AddIcon />}
              onClick={() => setShowNewFrequency(true)}
              sx={{ mt: 1 }}
            >
              Add New Frequency
            </Button>
          ) : (
            <Box sx={{ mt: 2, p: 2, border: '1px solid #ccc', borderRadius: 1 }}>
              <Typography variant="subtitle2" gutterBottom>
                New Frequency
              </Typography>
              <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                <TextField
                  label="Frequency (e.g., 146.520 MHz)"
                  value={newFrequency.frequency}
                  onChange={(e) => setNewFrequency({ ...newFrequency, frequency: e.target.value })}
                  size="small"
                />
                <FormControl size="small" sx={{ minWidth: 120 }}>
                  <InputLabel>Mode</InputLabel>
                  <Select
                    value={newFrequency.mode}
                    onChange={(e) => setNewFrequency({ ...newFrequency, mode: e.target.value })}
                  >
                    <MenuItem value="FM">FM</MenuItem>
                    <MenuItem value="SSB">SSB</MenuItem>
                    <MenuItem value="DMR">DMR</MenuItem>
                    <MenuItem value="D-STAR">D-STAR</MenuItem>
                    <MenuItem value="YSF">YSF</MenuItem>
                    <MenuItem value="P25">P25</MenuItem>
                  </Select>
                </FormControl>
                <Button variant="contained" size="small" onClick={handleAddFrequency}>
                  Add
                </Button>
                <Button size="small" onClick={() => setShowNewFrequency(false)}>
                  Cancel
                </Button>
              </Box>
            </Box>
          )}

          <Box sx={{ mt: 4, display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
            <Button variant="outlined" onClick={() => navigate('/dashboard')}>
              Cancel
            </Button>
            <Button
              variant="contained"
              onClick={handleCreateNet}
              disabled={!name}
            >
              Create Net
            </Button>
          </Box>
        </Box>
      </Paper>
    </Container>
  );
};

export default CreateNet;
