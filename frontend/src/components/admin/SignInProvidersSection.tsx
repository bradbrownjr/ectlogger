// ========== SIGN-IN PROVIDERS (Admin > Security) ==========
// Set up Google, Microsoft or another OpenID Connect sign-in without touching
// the server (backend routers/sign_in_providers.py, /admin/sign-in-providers).
// The redirect address shown here, with a Copy button, is the one value the
// admin pastes into the provider's console. The client secret is never sent
// back: the form only says whether one is saved. Every change is in Admin >
// Activity. See docs/admins/sign-in-providers.md.

import React, { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControlLabel,
  IconButton,
  InputAdornment,
  Link,
  Menu,
  MenuItem,
  Radio,
  RadioGroup,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import CheckIcon from '@mui/icons-material/Check';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import LoginIcon from '@mui/icons-material/Login';
import {
  SignInProviderAdmin,
  SignInProviderPayload,
  SignInProviderPublic,
  signInProvidersApi,
} from '../../services/api';
import { getErrorMessage } from '../../utils/apiErrors';
import { providerIcon } from '../SignInProviderButtons';

const DOCS_URL = 'https://ectlogger.us/docs/admins/sign-in-providers/';
type Kind = SignInProviderPublic['kind'];
const KIND_NAMES: Record<Kind, string> = { google: 'Google', microsoft: 'Microsoft', oidc: 'Other (OpenID Connect)' };

interface FormState {
  kind: Kind;
  slug: string;
  label: string;
  enabled: boolean;
  client_id: string;
  client_secret: string;
  issuer_url: string;
  microsoft_scope: 'any' | 'organization';
  microsoft_tenant: string;
  allow_signup: boolean;
  allowed_domains: string;
}

const blankForm = (kind: Kind): FormState => ({
  kind,
  slug: kind === 'oidc' ? '' : kind,
  label: kind === 'oidc' ? '' : KIND_NAMES[kind],
  enabled: true,
  client_id: '',
  client_secret: '',
  issuer_url: '',
  microsoft_scope: 'any',
  microsoft_tenant: '',
  allow_signup: true,
  allowed_domains: '',
});

const formFrom = (p: SignInProviderAdmin): FormState => ({
  kind: p.kind,
  slug: p.slug,
  label: p.label,
  enabled: p.enabled,
  client_id: p.client_id,
  client_secret: '',
  issuer_url: p.issuer_url || '',
  microsoft_scope: p.microsoft_tenant ? 'organization' : 'any',
  microsoft_tenant: p.microsoft_tenant || '',
  allow_signup: p.allow_signup,
  allowed_domains: p.allowed_domains.join(', '),
});

const payloadFrom = (form: FormState, editing: boolean): SignInProviderPayload => ({
  ...(editing ? {} : { kind: form.kind, slug: form.kind === 'oidc' ? form.slug.trim() : undefined }),
  label: form.label.trim(),
  enabled: form.enabled,
  client_id: form.client_id.trim(),
  ...(form.client_secret.trim() ? { client_secret: form.client_secret.trim() } : {}),
  issuer_url: form.kind === 'oidc' ? form.issuer_url.trim() : null,
  microsoft_tenant: form.kind === 'microsoft' && form.microsoft_scope === 'organization'
    ? form.microsoft_tenant.trim() : null,
  allow_signup: form.allow_signup,
  allowed_domains: form.allowed_domains.split(/[\s,]+/).map((d) => d.trim()).filter(Boolean),
});

// ---------- Copyable address ----------
const CopyField: React.FC<{ label: string; value: string; helperText?: string }> = ({ label, value, helperText }) => {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: the field can still be selected and copied by hand.
    }
  };
  return (
    <TextField
      fullWidth
      label={label}
      value={value}
      helperText={helperText}
      InputProps={{
        readOnly: true,
        endAdornment: (
          <InputAdornment position="end">
            <Tooltip title={copied ? 'Copied' : 'Copy'}>
              <IconButton aria-label="Copy" onClick={copy} edge="end">
                {copied ? <CheckIcon color="success" /> : <ContentCopyIcon />}
              </IconButton>
            </Tooltip>
          </InputAdornment>
        ),
      }}
    />
  );
};

const SignInProvidersSection: React.FC = () => {
  const [providers, setProviders] = useState<SignInProviderAdmin[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [addMenu, setAddMenu] = useState<HTMLElement | null>(null);

  const [editing, setEditing] = useState<SignInProviderAdmin | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [redirectUri, setRedirectUri] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const [removing, setRemoving] = useState<SignInProviderAdmin | null>(null);
  const [testing, setTesting] = useState<number | null>(null);
  const [tests, setTests] = useState<Record<number, { ok: boolean; problems: string[] }>>({});

  const load = async () => {
    try {
      const response = await signInProvidersApi.adminList();
      setProviders(response.data);
      setLoadError('');
    } catch (err) {
      setLoadError(getErrorMessage(err, "Couldn't load the sign-in options"));
    }
  };

  useEffect(() => { load(); }, []);

  // The redirect address follows the short name while adding an Other provider.
  useEffect(() => {
    if (!form) return;
    if (editing) {
      setRedirectUri(editing.redirect_uri);
      return;
    }
    const slug = form.slug.trim();
    if (!/^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/.test(slug)) {
      setRedirectUri('');
      return;
    }
    const timer = window.setTimeout(() => {
      signInProvidersApi.adminRedirectUri(slug)
        .then((response) => setRedirectUri(response.data.redirect_uri))
        .catch(() => setRedirectUri(''));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [form?.slug, editing]); // eslint-disable-line react-hooks/exhaustive-deps

  const openAdd = (kind: Kind) => {
    setAddMenu(null);
    setEditing(null);
    setForm(blankForm(kind));
    setFormError('');
  };

  const openEdit = (p: SignInProviderAdmin) => {
    setEditing(p);
    setForm(formFrom(p));
    setFormError('');
  };

  const closeForm = () => {
    if (saving) return;
    setForm(null);
    setEditing(null);
  };

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => (f ? { ...f, [key]: value } : f));

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    setFormError('');
    try {
      if (editing) await signInProvidersApi.adminUpdate(editing.id, payloadFrom(form, true));
      else await signInProvidersApi.adminCreate(payloadFrom(form, false));
      setForm(null);
      setEditing(null);
      await load();
    } catch (err) {
      setFormError(getErrorMessage(err, "Couldn't save. Check the fields and try again."));
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async (p: SignInProviderAdmin) => {
    setTesting(p.id);
    try {
      const response = await signInProvidersApi.adminTest(p.id);
      setTests((t) => ({ ...t, [p.id]: response.data }));
    } catch (err) {
      setTests((t) => ({ ...t, [p.id]: { ok: false, problems: [getErrorMessage(err, "Couldn't run the test.")] } }));
    } finally {
      setTesting(null);
    }
  };

  const handleRemove = async () => {
    if (!removing) return;
    setSaving(true);
    try {
      await signInProvidersApi.adminDelete(removing.id);
      setRemoving(null);
      await load();
    } catch (err) {
      setLoadError(getErrorMessage(err, "Couldn't remove it. Try again."));
      setRemoving(null);
    } finally {
      setSaving(false);
    }
  };

  const takenKinds = new Set((providers || []).filter((p) => p.kind !== 'oidc').map((p) => p.kind));
  const secretMissing = !!form && !form.client_secret.trim() && !(editing?.client_secret_readable);

  return (
    <Card variant="outlined" sx={{ mb: 3 }}>
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1, mb: 1 }}>
          <Typography variant="h6">
            <LoginIcon sx={{ verticalAlign: 'middle', mr: 1 }} />
            Sign in with Google, Microsoft and others
          </Typography>
          <Button startIcon={<AddIcon />} variant="outlined" onClick={(e) => setAddMenu(e.currentTarget)}>
            Add
          </Button>
          <Menu anchorEl={addMenu} open={!!addMenu} onClose={() => setAddMenu(null)}>
            {(['google', 'microsoft', 'oidc'] as Kind[]).map((kind) => (
              <MenuItem key={kind} onClick={() => openAdd(kind)} disabled={takenKinds.has(kind)}>
                <Box sx={{ mr: 1.5, display: 'flex' }}>{providerIcon(kind)}</Box>
                {KIND_NAMES[kind]}
              </MenuItem>
            ))}
          </Menu>
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Let people sign in with an account they already have. Email links and passwords keep working.
          Each one needs an app registered with the provider first.{' '}
          <Link href={DOCS_URL} target="_blank" rel="noopener noreferrer">How to set one up</Link>
        </Typography>

        {loadError && <Alert severity="error" sx={{ mb: 2 }}>{loadError}</Alert>}
        {providers === null && !loadError && <CircularProgress size={24} />}
        {providers?.length === 0 && (
          <Typography variant="body2" color="text.secondary">None set up. The sign-in page shows email and password only.</Typography>
        )}

        {/* ========== PROVIDER LIST ========== */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {providers?.map((p) => (
            <Box key={p.id} sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                {providerIcon(p.kind)}
                <Typography variant="subtitle1" sx={{ fontWeight: 500 }}>{p.label}</Typography>
                <Chip size="small" label={p.enabled ? 'On' : 'Off'} color={p.enabled ? 'success' : 'default'} />
                <Typography variant="body2" color="text.secondary">
                  {p.linked_accounts === 1 ? '1 linked account' : `${p.linked_accounts} linked accounts`}
                </Typography>
              </Box>
              {p.has_client_secret && !p.client_secret_readable && (
                <Alert severity="warning" sx={{ mt: 1 }}>
                  The saved client secret can't be read because the server's secret key changed. Edit this and enter it again.
                </Alert>
              )}
              {tests[p.id] && (
                <Alert severity={tests[p.id].ok ? 'success' : 'error'} sx={{ mt: 1 }}>
                  {tests[p.id].ok
                    ? 'The provider answered and the settings look right. Sign in with it to finish checking the client ID and secret.'
                    : tests[p.id].problems.join(' ')}
                </Alert>
              )}
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1.5, justifyContent: 'flex-end' }}>
                <Button color="error" onClick={() => setRemoving(p)}>Remove</Button>
                <Button onClick={() => handleTest(p)} disabled={testing === p.id}
                  startIcon={testing === p.id ? <CircularProgress size={20} /> : undefined}>
                  Test
                </Button>
                <Button variant="contained" onClick={() => openEdit(p)}>Edit</Button>
              </Box>
            </Box>
          ))}
        </Box>
      </CardContent>

      {/* ========== ADD / EDIT DIALOG ========== */}
      <Dialog open={!!form} onClose={closeForm} maxWidth="sm" fullWidth PaperProps={{ sx: { m: { xs: 1, sm: 4 } } }}>
        {form && (
          <Box component="form" onSubmit={handleSave}>
            <DialogTitle>{editing ? `Edit ${editing.label}` : `Add ${KIND_NAMES[form.kind]}`}</DialogTitle>
            <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important' }}>
              {formError && <Alert severity="error">{formError}</Alert>}

              {/* Other only: the short name forms the redirect address */}
              {form.kind === 'oidc' && (
                <>
                  <TextField
                    label="Short name"
                    value={form.slug}
                    onChange={(e) => set('slug', e.target.value.toLowerCase())}
                    disabled={!!editing}
                    required
                    helperText={editing ? "Can't be changed: it's part of the redirect address." : 'Lower-case letters, numbers and hyphens, like authentik.'}
                  />
                  <TextField
                    label="Issuer address"
                    value={form.issuer_url}
                    onChange={(e) => set('issuer_url', e.target.value)}
                    required
                    placeholder="https://auth.example.org/application/o/ectlogger/"
                    helperText="From the provider's settings. Its discovery document is at this address plus /.well-known/openid-configuration."
                  />
                </>
              )}

              {redirectUri ? (
                <CopyField
                  label="Redirect address"
                  value={redirectUri}
                  helperText="Paste this into the provider's console as the redirect URI."
                />
              ) : form.kind === 'oidc' && !editing ? (
                <Typography variant="body2" color="text.secondary">Enter a short name to see the redirect address.</Typography>
              ) : null}

              <TextField label="Button label" value={form.label} onChange={(e) => set('label', e.target.value)}
                required inputProps={{ maxLength: 60 }} helperText={`The sign-in button reads "Sign in with ${form.label || '…'}".`} />
              <TextField label="Client ID" value={form.client_id} onChange={(e) => set('client_id', e.target.value)} required />
              <TextField
                label="Client secret"
                type="password"
                autoComplete="off"
                value={form.client_secret}
                onChange={(e) => set('client_secret', e.target.value)}
                helperText={editing?.client_secret_readable ? 'Saved. Leave this empty to keep it.' : "The provider shows it once, when you create it."}
              />

              {/* Microsoft only: which accounts may sign in */}
              {form.kind === 'microsoft' && (
                <Box>
                  <Typography variant="body2" sx={{ mb: 0.5 }}>Who can sign in</Typography>
                  <RadioGroup value={form.microsoft_scope} onChange={(e) => set('microsoft_scope', e.target.value as FormState['microsoft_scope'])}>
                    <FormControlLabel value="any" control={<Radio />} label="Any Microsoft account, personal or work and school" />
                    <FormControlLabel value="organization" control={<Radio />} label="Only my organization" />
                  </RadioGroup>
                  {form.microsoft_scope === 'organization' && (
                    <TextField fullWidth label="Tenant ID" value={form.microsoft_tenant}
                      onChange={(e) => set('microsoft_tenant', e.target.value)} required
                      helperText="From the app's Overview page in Microsoft Entra: Directory (tenant) ID." />
                  )}
                </Box>
              )}

              <FormControlLabel
                control={<Switch checked={form.allow_signup} onChange={(e) => set('allow_signup', e.target.checked)} />}
                label="Create an account the first time someone signs in"
              />
              <TextField
                label="Only these email domains (optional)"
                value={form.allowed_domains}
                onChange={(e) => set('allowed_domains', e.target.value)}
                disabled={!form.allow_signup}
                placeholder="club.org, example.org"
                helperText="Limits who gets a new account. Leave empty for anyone. People who already have an account can always sign in."
              />
              <FormControlLabel
                control={<Switch checked={form.enabled} onChange={(e) => set('enabled', e.target.checked)} />}
                label="Show on the sign-in page"
              />
              {form.enabled && secretMissing && (
                <Typography variant="body2" color="text.secondary">Add the client secret to turn this on.</Typography>
              )}
            </DialogContent>
            <DialogActions sx={{ flexWrap: 'wrap', justifyContent: 'flex-end', gap: 1, px: 3, pb: 2 }} disableSpacing>
              <Button variant="outlined" color="inherit" onClick={closeForm} disabled={saving}>Cancel</Button>
              <Button type="submit" variant="contained" disabled={saving || (form.enabled && secretMissing)}
                startIcon={saving ? <CircularProgress size={20} /> : undefined}>
                Save
              </Button>
            </DialogActions>
          </Box>
        )}
      </Dialog>

      {/* ========== REMOVE CONFIRM ========== */}
      <Dialog open={!!removing} onClose={() => !saving && setRemoving(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Remove {removing?.label}?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Its button leaves the sign-in page, and {removing?.linked_accounts === 1 ? 'the 1 account' : `the ${removing?.linked_accounts ?? 0} accounts`} linked
            to it are unlinked. Those people can still sign in with an email link or password.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ flexWrap: 'wrap', justifyContent: 'flex-end', gap: 1, px: 3, pb: 2 }} disableSpacing>
          <Button variant="outlined" color="inherit" onClick={() => setRemoving(null)} disabled={saving}>Cancel</Button>
          <Button variant="contained" color="error" onClick={handleRemove} disabled={saving}>Remove</Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
};

export default SignInProvidersSection;
