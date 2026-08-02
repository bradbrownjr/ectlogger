import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  TextField,
  InputAdornment,
  IconButton,
  CircularProgress,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Tooltip,
  Fab,
  TablePagination,
  Alert,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import SendIcon from '@mui/icons-material/Send';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import useSortableTable from '../../hooks/useSortableTable';
import { contactApi } from '../../services/api';
import { formatDate } from '../../utils/dateUtils';
import { getErrorMessage } from '../../utils/apiErrors';

interface Contact {
  id: number;
  callsign: string;
  name?: string;
  location?: string;
  email?: string;
  skywarn_number?: string;
  notes?: string;
  user_id?: number;
  created_at: string;
  updated_at?: string;
}

type ContactSortField = 'callsign' | 'name' | 'location' | 'email' | 'status' | 'created_at';

interface Props {
  showSnackbar: (message: string, severity: 'success' | 'error') => void;
  onUserCreated?: () => void;
}

const AdminContactsTab: React.FC<Props> = ({ showSnackbar, onUserCreated }) => {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [deleteContactDialogOpen, setDeleteContactDialogOpen] = useState(false);
  const [contactToDelete, setContactToDelete] = useState<Contact | null>(null);
  const [contactFilter, setContactFilter] = useState('');
  const [contactsPage, setContactsPage] = useState(0);
  const [contactsPerPage, setContactsPerPage] = useState(25);
  const [inlineEditingContactId, setInlineEditingContactId] = useState<number | null>(null);
  const [inlineEditContactValues, setInlineEditContactValues] = useState<Record<string, string>>({});
  const [inlineEditContactFocusField, setInlineEditContactFocusField] = useState<string | null>(null);
  const [addContactDialogOpen, setAddContactDialogOpen] = useState(false);
  const [addContactForm, setAddContactForm] = useState({
    callsign: '',
    name: '',
    location: '',
    email: '',
    skywarn_number: '',
    notes: '',
  });
  const [addContactSaving, setAddContactSaving] = useState(false);

  const inlineEditContactRowRef = useRef<HTMLTableRowElement | null>(null);

  const { sortField: contactSortField, sortDirection: contactSortDirection, handleSort: _handleContactSortBase } =
    useSortableTable<ContactSortField>('callsign');

  const fetchContacts = async () => {
    setContactsLoading(true);
    try {
      const response = await contactApi.list();
      setContacts(response.data);
    } catch (error) {
      console.error('Failed to fetch contacts:', error);
    } finally {
      setContactsLoading(false);
    }
  };

  useEffect(() => {
    fetchContacts();
  }, []);

  // ========== CONTACT FILTERING & SORTING ==========
  const filteredContacts = contacts.filter((contact) => {
    if (!contactFilter) return true;
    const searchTerm = contactFilter.toLowerCase();
    return (
      contact.callsign.toLowerCase().includes(searchTerm) ||
      (contact.name?.toLowerCase().includes(searchTerm)) ||
      (contact.location?.toLowerCase().includes(searchTerm)) ||
      (contact.email?.toLowerCase().includes(searchTerm)) ||
      (contact.notes?.toLowerCase().includes(searchTerm))
    );
  });

  const sortedContacts = [...filteredContacts].sort((a, b) => {
    let aVal: string | number = '';
    let bVal: string | number = '';

    switch (contactSortField) {
      case 'callsign':
        aVal = a.callsign;
        bVal = b.callsign;
        break;
      case 'name':
        aVal = a.name || '';
        bVal = b.name || '';
        break;
      case 'location':
        aVal = a.location || '';
        bVal = b.location || '';
        break;
      case 'email':
        aVal = a.email || '';
        bVal = b.email || '';
        break;
      case 'status':
        aVal = a.user_id ? 1 : 0;
        bVal = b.user_id ? 1 : 0;
        break;
      case 'created_at':
        aVal = new Date(a.created_at.endsWith('Z') ? a.created_at : a.created_at + 'Z').getTime();
        bVal = new Date(b.created_at.endsWith('Z') ? b.created_at : b.created_at + 'Z').getTime();
        break;
    }

    if (contactSortField === 'status' || contactSortField === 'created_at') {
      return contactSortDirection === 'asc'
        ? (aVal as number) - (bVal as number)
        : (bVal as number) - (aVal as number);
    }

    const comparison = (aVal as string).localeCompare(bVal as string, undefined, { numeric: true, sensitivity: 'base' });
    return contactSortDirection === 'asc' ? comparison : -comparison;
  });

  const pagedContacts = contactsPerPage === -1
    ? sortedContacts
    : sortedContacts.slice(contactsPage * contactsPerPage, contactsPage * contactsPerPage + contactsPerPage);

  const handleContactSort = (field: ContactSortField) => {
    _handleContactSortBase(field);
    setContactsPage(0);
  };

  // ========== CONTACTS INLINE EDITING HANDLERS ==========
  const handleStartContactInlineEdit = (contact: Contact, focusField: string = 'name') => {
    setInlineEditingContactId(contact.id);
    setInlineEditContactFocusField(focusField);
    setInlineEditContactValues({
      name: contact.name || '',
      location: contact.location || '',
      email: contact.email || '',
      skywarn_number: contact.skywarn_number || '',
      notes: contact.notes || '',
    });
  };

  const handleSaveContactInlineEdit = async () => {
    if (!inlineEditingContactId) return;

    try {
      const payload = {
        name: inlineEditContactValues.name || null,
        location: inlineEditContactValues.location || null,
        email: inlineEditContactValues.email || null,
        skywarn_number: inlineEditContactValues.skywarn_number || null,
        notes: inlineEditContactValues.notes || null,
      };
      await contactApi.update(inlineEditingContactId, payload);
      setInlineEditingContactId(null);
      setInlineEditContactValues({});
      setInlineEditContactFocusField(null);
      fetchContacts();
    } catch (error: any) {
      const message = getErrorMessage(error, 'Failed to update contact');
      showSnackbar(message, 'error');
    }
  };

  const handleCancelContactInlineEdit = () => {
    setInlineEditingContactId(null);
    setInlineEditContactValues({});
    setInlineEditContactFocusField(null);
  };

  const handleContactInlineFieldChange = (field: string, value: string) => {
    setInlineEditContactValues(prev => ({ ...prev, [field]: value }));
  };

  const handleContactInlineKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSaveContactInlineEdit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancelContactInlineEdit();
    }
  };

  const handleContactInlineBlur = (_e: React.FocusEvent) => {
    setTimeout(() => {
      const activeElement = document.activeElement;
      if (inlineEditContactRowRef.current && inlineEditContactRowRef.current.contains(activeElement)) {
        return;
      }
      handleSaveContactInlineEdit();
    }, 0);
  };

  // ========== ADD CONTACT DIALOG HANDLER ==========
  const handleOpenAddContactDialog = () => {
    setAddContactForm({
      callsign: '',
      name: '',
      location: '',
      email: '',
      skywarn_number: '',
      notes: '',
    });
    setAddContactDialogOpen(true);
  };

  const handleSaveNewContact = async () => {
    if (!addContactForm.callsign) {
      showSnackbar('Callsign is required', 'error');
      return;
    }

    setAddContactSaving(true);
    try {
      const payload = {
        callsign: addContactForm.callsign.toUpperCase(),
        name: addContactForm.name || null,
        location: addContactForm.location || null,
        email: addContactForm.email || null,
        skywarn_number: addContactForm.skywarn_number || null,
        notes: addContactForm.notes || null,
      };
      await contactApi.create(payload);
      showSnackbar('Contact created', 'success');
      setAddContactDialogOpen(false);
      fetchContacts();
    } catch (error: any) {
      const message = getErrorMessage(error, 'Failed to create contact');
      showSnackbar(message, 'error');
    } finally {
      setAddContactSaving(false);
    }
  };

  const handleDeleteContactClick = (contact: Contact) => {
    setContactToDelete(contact);
    setDeleteContactDialogOpen(true);
  };

  const handleDeleteContact = async () => {
    if (!contactToDelete) return;
    try {
      await contactApi.delete(contactToDelete.id);
      showSnackbar('Contact deleted', 'success');
      setDeleteContactDialogOpen(false);
      setContactToDelete(null);
      fetchContacts();
    } catch (error: any) {
      const message = getErrorMessage(error, 'Failed to delete contact');
      showSnackbar(message, 'error');
    }
  };

  const handleInviteContact = async (contact: Contact) => {
    if (!contact.email) {
      showSnackbar('Contact has no email address. Edit the contact to add one first.', 'error');
      return;
    }
    if (contact.user_id) {
      showSnackbar('Contact already has a linked user account', 'error');
      return;
    }
    if (!confirm(`Send invite to ${contact.callsign} at ${contact.email}?`)) return;

    try {
      const response = await contactApi.invite(contact.id);
      const msg = response.data.email_error
        ? `Account created but email failed: ${response.data.message}`
        : response.data.message;
      showSnackbar(msg, response.data.email_error ? 'error' : 'success');
      fetchContacts();
      onUserCreated?.();
    } catch (error: any) {
      const message = getErrorMessage(error, 'Failed to invite contact');
      showSnackbar(message, 'error');
    }
  };

  return (
    <>
      {/* ========== CONTACTS TAB ========== */}
      <Alert severity="info" sx={{ mb: 3 }}>
        Station contacts auto-populate from check-in history. Click any row to edit inline — fix names, add emails, and send invites to create user accounts.
        Auto-fill data flows to NCS when they enter a callsign during check-in.
      </Alert>

      {/* ========== CONTACT FILTER INPUT ========== */}
      <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
        <TextField
          size="small"
          placeholder="Filter by callsign, name, location, or email..."
          value={contactFilter}
          onChange={(e) => { setContactFilter(e.target.value); setContactsPage(0); }}
          sx={{ flexGrow: 1, maxWidth: 500 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon color="action" />
              </InputAdornment>
            ),
            endAdornment: contactFilter && (
              <InputAdornment position="end">
                <IconButton size="small" onClick={() => setContactFilter('')}>
                  <ClearIcon fontSize="small" />
                </IconButton>
              </InputAdornment>
            ),
          }}
        />
        <Typography variant="body2" color="text.secondary">
          {filteredContacts.length} of {contacts.length} contacts
        </Typography>
      </Box>

      {contactsLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      ) : (
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>
                  <TableSortLabel
                    active={contactSortField === 'callsign'}
                    direction={contactSortField === 'callsign' ? contactSortDirection : 'asc'}
                    onClick={() => handleContactSort('callsign')}
                  >
                    Callsign
                  </TableSortLabel>
                </TableCell>
                <TableCell>
                  <TableSortLabel
                    active={contactSortField === 'name'}
                    direction={contactSortField === 'name' ? contactSortDirection : 'asc'}
                    onClick={() => handleContactSort('name')}
                  >
                    Name
                  </TableSortLabel>
                </TableCell>
                <TableCell>
                  <TableSortLabel
                    active={contactSortField === 'location'}
                    direction={contactSortField === 'location' ? contactSortDirection : 'asc'}
                    onClick={() => handleContactSort('location')}
                  >
                    Location
                  </TableSortLabel>
                </TableCell>
                <TableCell>
                  <TableSortLabel
                    active={contactSortField === 'email'}
                    direction={contactSortField === 'email' ? contactSortDirection : 'asc'}
                    onClick={() => handleContactSort('email')}
                  >
                    Email
                  </TableSortLabel>
                </TableCell>
                <TableCell>
                  <TableSortLabel
                    active={contactSortField === 'status'}
                    direction={contactSortField === 'status' ? contactSortDirection : 'asc'}
                    onClick={() => handleContactSort('status')}
                  >
                    Status
                  </TableSortLabel>
                </TableCell>
                <TableCell>
                  <TableSortLabel
                    active={contactSortField === 'created_at'}
                    direction={contactSortField === 'created_at' ? contactSortDirection : 'asc'}
                    onClick={() => handleContactSort('created_at')}
                  >
                    First Seen
                  </TableSortLabel>
                </TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sortedContacts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                    <Typography color="text.secondary">
                      {contactFilter ? 'No contacts match your filter' : "No contacts yet. They'll appear as stations check in."}
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                pagedContacts.map((contact) => {
                  const isInlineEditing = inlineEditingContactId === contact.id;
                  return (
                    <TableRow
                      key={contact.id}
                      ref={isInlineEditing ? inlineEditContactRowRef : undefined}
                      hover={!isInlineEditing}
                      onClick={(e) => {
                        const target = e.target as HTMLElement;
                        if (target.closest('button, input, .MuiIconButton-root, .MuiChip-root')) return;
                        if (isInlineEditing) return;
                        const cell = target.closest('td[data-field]') as HTMLElement | null;
                        const focusField = cell?.dataset.field || 'name';
                        handleStartContactInlineEdit(contact, focusField);
                      }}
                      sx={{
                        cursor: !isInlineEditing ? 'pointer' : 'default',
                        ...(isInlineEditing && {
                          outline: '2px solid',
                          outlineColor: 'primary.main',
                        }),
                      }}
                    >
                      {/* Callsign - read-only (primary identifier) */}
                      <TableCell>
                        <Typography variant="body2" fontWeight="bold" sx={{ fontFamily: 'monospace' }}>
                          {contact.callsign}
                        </Typography>
                      </TableCell>
                      {/* Name - inline editable */}
                      <TableCell data-field="name">
                        {isInlineEditing ? (
                          <TextField
                            size="small"
                            value={inlineEditContactValues.name || ''}
                            onChange={(e) => handleContactInlineFieldChange('name', e.target.value)}
                            onKeyDown={handleContactInlineKeyDown}
                            onBlur={handleContactInlineBlur}
                            autoFocus={inlineEditContactFocusField === 'name'}
                            inputProps={{ style: { padding: '4px 8px' } }}
                            sx={{ width: '100%' }}
                          />
                        ) : (
                          contact.name || <Typography variant="body2" color="text.disabled">—</Typography>
                        )}
                      </TableCell>
                      {/* Location - inline editable */}
                      <TableCell data-field="location">
                        {isInlineEditing ? (
                          <TextField
                            size="small"
                            value={inlineEditContactValues.location || ''}
                            onChange={(e) => handleContactInlineFieldChange('location', e.target.value)}
                            onKeyDown={handleContactInlineKeyDown}
                            onBlur={handleContactInlineBlur}
                            autoFocus={inlineEditContactFocusField === 'location'}
                            inputProps={{ style: { padding: '4px 8px' } }}
                            sx={{ width: '100%' }}
                          />
                        ) : (
                          contact.location || <Typography variant="body2" color="text.disabled">—</Typography>
                        )}
                      </TableCell>
                      {/* Email - inline editable */}
                      <TableCell data-field="email">
                        {isInlineEditing ? (
                          <TextField
                            size="small"
                            type="email"
                            value={inlineEditContactValues.email || ''}
                            onChange={(e) => handleContactInlineFieldChange('email', e.target.value)}
                            onKeyDown={handleContactInlineKeyDown}
                            onBlur={handleContactInlineBlur}
                            autoFocus={inlineEditContactFocusField === 'email'}
                            inputProps={{ style: { padding: '4px 8px' } }}
                            sx={{ width: '100%' }}
                          />
                        ) : (
                          contact.email || <Typography variant="body2" color="text.disabled">—</Typography>
                        )}
                      </TableCell>
                      {/* Status chip - read-only */}
                      <TableCell>
                        {contact.user_id ? (
                          <Chip label="User" color="success" size="small" />
                        ) : contact.email ? (
                          <Chip label="Has Email" color="info" size="small" variant="outlined" />
                        ) : (
                          <Chip label="Contact" size="small" variant="outlined" />
                        )}
                      </TableCell>
                      {/* First Seen - read-only */}
                      <TableCell>
                        <Typography variant="body2" color="text.secondary">
                          {formatDate(contact.created_at)}
                        </Typography>
                      </TableCell>
                      {/* Actions */}
                      <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                        <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                          {contact.email && !contact.user_id && (
                            <Tooltip title="Send invite email">
                              <IconButton size="small" color="primary" onClick={() => handleInviteContact(contact)}>
                                <SendIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                          {!contact.user_id && (
                            <Tooltip title="Delete contact">
                              <IconButton size="small" color="error" onClick={() => handleDeleteContactClick(contact)}>
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                        </Box>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      {!contactsLoading && sortedContacts.length > 0 && (
        <TablePagination
          component="div"
          count={sortedContacts.length}
          page={contactsPage}
          onPageChange={(_, newPage) => setContactsPage(newPage)}
          rowsPerPage={contactsPerPage}
          onRowsPerPageChange={(e) => { setContactsPerPage(parseInt(e.target.value, 10)); setContactsPage(0); }}
          rowsPerPageOptions={[25, 50, { label: 'All', value: -1 }]}
          labelRowsPerPage="Per page:"
        />
      )}

      {/* Add Contact FAB */}
      <Tooltip title="Add contact">
        <Fab
          color="primary"
          aria-label="add contact"
          sx={{ position: 'fixed', bottom: 16, right: 16 }}
          onClick={handleOpenAddContactDialog}
        >
          <AddIcon />
        </Fab>
      </Tooltip>

      {/* ========== ADD NEW CONTACT DIALOG ========== */}
      <Dialog open={addContactDialogOpen} onClose={() => setAddContactDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add New Contact</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              label="Callsign"
              value={addContactForm.callsign}
              onChange={(e) => setAddContactForm({ ...addContactForm, callsign: e.target.value.toUpperCase() })}
              required
              fullWidth
              inputProps={{ style: { textTransform: 'uppercase', fontFamily: 'monospace' } }}
              helperText="Amateur or GMRS callsign"
            />
            <TextField
              label="Name"
              value={addContactForm.name}
              onChange={(e) => setAddContactForm({ ...addContactForm, name: e.target.value })}
              fullWidth
            />
            <TextField
              label="Location"
              value={addContactForm.location}
              onChange={(e) => setAddContactForm({ ...addContactForm, location: e.target.value })}
              fullWidth
            />
            <TextField
              label="Email"
              type="email"
              value={addContactForm.email}
              onChange={(e) => setAddContactForm({ ...addContactForm, email: e.target.value })}
              fullWidth
              helperText="Add email to send an invite and create a user account"
            />
            <TextField
              label="SKYWARN / Spotter #"
              value={addContactForm.skywarn_number}
              onChange={(e) => setAddContactForm({ ...addContactForm, skywarn_number: e.target.value })}
              fullWidth
            />
            <TextField
              label="Notes"
              value={addContactForm.notes}
              onChange={(e) => setAddContactForm({ ...addContactForm, notes: e.target.value })}
              fullWidth
              multiline
              rows={2}
              helperText="Admin-only notes (not shared with the operator)"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddContactDialogOpen(false)} disabled={addContactSaving}>Cancel</Button>
          <Button
            onClick={handleSaveNewContact}
            variant="contained"
            disabled={!addContactForm.callsign || addContactSaving}
            startIcon={addContactSaving ? <CircularProgress size={20} color="inherit" /> : null}
          >
            Create
          </Button>
        </DialogActions>
      </Dialog>

      {/* ========== DELETE CONTACT CONFIRMATION DIALOG ========== */}
      <Dialog open={deleteContactDialogOpen} onClose={() => setDeleteContactDialogOpen(false)}>
        <DialogTitle>Delete Contact</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete this contact?
          </Typography>
          {contactToDelete && (
            <Box sx={{ mt: 2, p: 2, bgcolor: 'action.hover', borderRadius: 1 }}>
              <Typography variant="body2">
                <strong>Callsign:</strong> {contactToDelete.callsign}
              </Typography>
              {contactToDelete.name && (
                <Typography variant="body2">
                  <strong>Name:</strong> {contactToDelete.name}
                </Typography>
              )}
            </Box>
          )}
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            This won't delete historical check-in records. A new contact will be auto-created if this callsign checks in again.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteContactDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleDeleteContact} variant="contained" color="error">
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default AdminContactsTab;
