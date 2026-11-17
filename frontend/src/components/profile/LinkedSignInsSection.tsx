// ========== LINKED SIGN-INS (Profile > Security) ==========
// Google, Microsoft or other OpenID Connect accounts that sign in to this
// ECTLogger account (backend routers/sign_in_providers.py). Linking here works
// whatever address the provider holds, so it covers every case the sign-in
// page can't match by email. Link is a full page load to the provider, which
// sends the browser back to /profile?tab=security&signin_link=<result>.
// Hidden when an admin hasn't turned on any provider and nothing is linked.

import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Typography,
} from '@mui/material';
import { LinkedSignIn, SignInProviderPublic, signInProvidersApi } from '../../services/api';
import { getErrorMessage } from '../../utils/apiErrors';
import { formatDate } from '../../utils/dateUtils';
import { linkResult } from '../../utils/signInProviders';
import { providerIcon } from '../SignInProviderButtons';

const LinkedSignInsSection: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [providers, setProviders] = useState<SignInProviderPublic[]>([]);
  const [linked, setLinked] = useState<LinkedSignIn[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [unlinking, setUnlinking] = useState<LinkedSignIn | null>(null);
  // How a link that just came back from the provider went.
  const [result] = useState(() => linkResult(searchParams.get('signin_link')));

  const load = async () => {
    try {
      const [p, l] = await Promise.all([signInProvidersApi.list(), signInProvidersApi.linked()]);
      setProviders(p.data);
      setLinked(l.data);
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't load your linked sign-ins"));
    }
  };

  useEffect(() => {
    load();
    // Take the result off the address so a reload doesn't show it again.
    if (searchParams.has('signin_link')) {
      const next = new URLSearchParams(searchParams);
      next.delete('signin_link');
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLink = async (slug: string) => {
    setBusy(slug);
    setError('');
    try {
      const response = await signInProvidersApi.linkStart(slug);
      window.location.assign(response.data.url);
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't start linking. Try again."));
      setBusy(null);
    }
  };

  const handleUnlink = async () => {
    if (!unlinking) return;
    setBusy(`unlink-${unlinking.id}`);
    setError('');
    try {
      await signInProvidersApi.unlink(unlinking.id);
      setUnlinking(null);
      await load();
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't unlink it. Try again."));
    } finally {
      setBusy(null);
    }
  };

  const unlinkedProviders = providers.filter((p) => !linked.some((l) => l.provider_slug === p.slug));
  if (providers.length === 0 && linked.length === 0 && !result) return null;

  return (
    <>
      <Typography variant="h6" gutterBottom>
        Google, Microsoft and other sign-ins
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Sign in with an account you already have. Your email link and password keep working.
      </Typography>
      {result && <Alert severity={result.severity} sx={{ mb: 2 }}>{result.text}</Alert>}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* ========== LINKED ========== */}
      {linked.length > 0 && (
        <List dense disablePadding sx={{ mb: 2 }}>
          {linked.map((l) => (
            <ListItem
              key={l.id}
              disableGutters
              secondaryAction={
                <Button variant="outlined" color="inherit" onClick={() => setUnlinking(l)} disabled={busy !== null}>
                  Unlink
                </Button>
              }
            >
              <ListItemIcon sx={{ minWidth: 36 }}>{providerIcon(l.kind)}</ListItemIcon>
              <ListItemText
                primary={l.provider_label}
                secondary={[
                  l.email_at_link,
                  l.last_used_at ? `last used ${formatDate(l.last_used_at)}` : l.linked_at ? `linked ${formatDate(l.linked_at)}` : null,
                ].filter(Boolean).join(' · ')}
                sx={{ pr: 12 }}
              />
            </ListItem>
          ))}
        </List>
      )}

      {/* ========== NOT LINKED YET ========== */}
      {unlinkedProviders.length > 0 && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 1 }}>
          {unlinkedProviders.map((p) => (
            <Button
              key={p.slug}
              variant="outlined"
              color="inherit"
              startIcon={providerIcon(p.kind)}
              onClick={() => handleLink(p.slug)}
              disabled={busy !== null}
            >
              Link {p.label}
            </Button>
          ))}
        </Box>
      )}

      {/* ========== UNLINK CONFIRM ========== */}
      <Dialog open={!!unlinking} onClose={() => busy === null && setUnlinking(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Unlink {unlinking?.provider_label}?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            You won't be able to sign in with {unlinking?.provider_label} until you link it again.
            Your email link and password still work.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ flexWrap: 'wrap', justifyContent: 'flex-end', gap: 1, px: 3, pb: 2 }} disableSpacing>
          <Button variant="outlined" color="inherit" onClick={() => setUnlinking(null)} disabled={busy !== null}>
            Cancel
          </Button>
          <Button variant="contained" color="error" onClick={handleUnlink} disabled={busy !== null}>
            Unlink
          </Button>
        </DialogActions>
      </Dialog>

      <Divider sx={{ my: 3 }} />
    </>
  );
};

export default LinkedSignInsSection;
