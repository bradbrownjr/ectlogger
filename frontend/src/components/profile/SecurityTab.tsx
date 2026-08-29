import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Box,
  Typography,
  TextField,
  Button,
  Alert,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Chip,
  IconButton,
  Tooltip,
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckIcon from '@mui/icons-material/Check';
import { useAuth } from '../../contexts/AuthContext';
import { authApi } from '../../services/api';
import { getErrorMessage } from '../../utils/apiErrors';

// ========== SECURITY TAB ==========
// Password fallback (for when magic-link email is down) and optional TOTP
// MFA. Required for admins (see backend app.dependencies.get_admin_user) --
// an admin routed here via the ?mfaRequired=1 query param (set by api.ts's
// response interceptor after hitting an admin-only route unenrolled) sees
// the enrollment section called out.

// Mirrors backend/app/auth.py::validate_password_strength -- keep both in
// sync. Client-side check is just for instant feedback; the backend is the
// actual enforcement point.
const PASSWORD_SPECIAL_CHARS = /[!@#$%^&*()_+\-=[\]{}|;:'",.<>/?`~\\]/;
function getPasswordStrengthError(password: string): string {
  if (password.length < 12) return 'Password must be at least 12 characters.';
  if (!/[a-z]/.test(password)) return 'Password must include at least one lowercase letter.';
  if (!/[A-Z]/.test(password)) return 'Password must include at least one uppercase letter.';
  if (!/[0-9]/.test(password)) return 'Password must include at least one number.';
  if (!PASSWORD_SPECIAL_CHARS.test(password)) return 'Password must include at least one special character.';
  return '';
}

const SecurityTab: React.FC = () => {
  const { user, login } = useAuth();
  const [searchParams] = useSearchParams();
  const mfaJustRequired = searchParams.get('mfaRequired') === '1';
  const isAdmin = user?.role === 'admin';

  const refreshUser = async () => {
    const token = localStorage.getItem('token');
    if (token) await login(token);
  };

  // ---------- Password ----------
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess(false);

    if (newPassword !== confirmPassword) {
      setPasswordError("New passwords don't match.");
      return;
    }
    const strengthError = getPasswordStrengthError(newPassword);
    if (strengthError) {
      setPasswordError(strengthError);
      return;
    }

    setPasswordSaving(true);
    try {
      await authApi.setPassword(newPassword, user?.has_password ? currentPassword : undefined);
      setPasswordSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      await refreshUser();
    } catch (err: any) {
      setPasswordError(getErrorMessage(err, 'Failed to update password'));
    } finally {
      setPasswordSaving(false);
    }
  };

  // ---------- MFA ----------
  type MfaStep = 'idle' | 'enrolling' | 'backup_codes';
  const [mfaStep, setMfaStep] = useState<MfaStep>('idle');
  const [isReplacing, setIsReplacing] = useState(false);
  const [mfaError, setMfaError] = useState('');
  const [qrDataUri, setQrDataUri] = useState('');
  const [secret, setSecret] = useState('');
  const [mfaPassword, setMfaPassword] = useState(''); // proves identity to start a replace
  const [mfaCode, setMfaCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [mfaBusy, setMfaBusy] = useState(false);

  const [disableOpen, setDisableOpen] = useState(false);
  const [disablePassword, setDisablePassword] = useState('');
  const [disableError, setDisableError] = useState('');
  const [disableBusy, setDisableBusy] = useState(false);

  const [secretCopied, setSecretCopied] = useState(false);
  const copySecret = async () => {
    try {
      await navigator.clipboard.writeText(secret);
      setSecretCopied(true);
      setTimeout(() => setSecretCopied(false), 2000);
    } catch {
      // Clipboard API unavailable/denied -- the key is still visible to copy by hand.
    }
  };

  const startEnrollment = async (replacing: boolean) => {
    setMfaError('');
    setIsReplacing(replacing);
    setMfaBusy(true);
    try {
      const response = replacing
        ? await authApi.mfaReplaceStart(mfaPassword)
        : await authApi.mfaSetupStart();
      setQrDataUri(response.data.qr_code_data_uri);
      setSecret(response.data.secret);
      setMfaStep('enrolling');
    } catch (err: any) {
      setMfaError(getErrorMessage(err, 'Failed to start two-factor setup'));
    } finally {
      setMfaBusy(false);
    }
  };

  const confirmEnrollment = async (e: React.FormEvent) => {
    e.preventDefault();
    setMfaError('');
    setMfaBusy(true);
    try {
      const response = isReplacing
        ? await authApi.mfaReplaceConfirm(mfaCode)
        : await authApi.mfaSetupConfirm(mfaCode);
      setBackupCodes(response.data.backup_codes);
      setMfaStep('backup_codes');
      setMfaCode('');
      setMfaPassword('');
      await refreshUser();
    } catch (err: any) {
      setMfaError(getErrorMessage(err, 'Incorrect verification code'));
    } finally {
      setMfaBusy(false);
    }
  };

  const finishEnrollment = () => {
    setMfaStep('idle');
    setBackupCodes([]);
    setQrDataUri('');
    setSecret('');
  };

  const handleDisable = async () => {
    setDisableError('');
    setDisableBusy(true);
    try {
      await authApi.mfaDisable(disablePassword);
      setDisableOpen(false);
      setDisablePassword('');
      await refreshUser();
    } catch (err: any) {
      setDisableError(getErrorMessage(err, 'Failed to disable two-factor authentication'));
    } finally {
      setDisableBusy(false);
    }
  };

  return (
    <>
      {/* ========== PASSWORD ========== */}
      <Typography variant="h6" gutterBottom>
        Password
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {user?.has_password
          ? 'A password is set on your account as a fallback if magic-link email is ever unavailable.'
          : "You don't have a password set. Magic link is all you need day to day, but a password lets you sign in even if email delivery is down."}
      </Typography>

      {passwordError && <Alert severity="error" sx={{ mb: 2 }}>{passwordError}</Alert>}
      {passwordSuccess && <Alert severity="success" sx={{ mb: 2 }}>Password updated.</Alert>}

      <Box component="form" onSubmit={handleSetPassword} sx={{ mb: 2 }}>
        {/* A hidden username field pairs with the password fields below so
            password managers can associate this form with the account's
            login identifier, not just a bare password. */}
        <input type="hidden" name="username" autoComplete="username" value={user?.email || ''} readOnly />
        {user?.has_password && (
          <TextField
            fullWidth
            type="password"
            label="Current Password"
            name="current-password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
            disabled={passwordSaving}
            sx={{ mb: 2 }}
          />
        )}
        <TextField
          fullWidth
          type="password"
          label={user?.has_password ? 'New Password' : 'Password'}
          name="new-password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          required
          disabled={passwordSaving}
          helperText="At least 12 characters, with upper/lowercase, a number, and a symbol."
          sx={{ mb: 2 }}
        />
        <TextField
          fullWidth
          type="password"
          label="Confirm Password"
          name="new-password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          disabled={passwordSaving}
          sx={{ mb: 2 }}
        />
        <Button type="submit" variant="contained" disabled={passwordSaving}>
          {passwordSaving ? 'Saving...' : user?.has_password ? 'Change Password' : 'Set Password'}
        </Button>
      </Box>

      <Divider sx={{ my: 3 }} />

      {/* ========== TWO-FACTOR AUTHENTICATION ========== */}
      <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        Two-Factor Authentication
        {user?.mfa_enabled && <Chip label="Enabled" color="success" size="small" />}
        {isAdmin && !user?.mfa_enabled && <Chip label="Required for admins" color="warning" size="small" />}
      </Typography>

      {mfaJustRequired && !user?.mfa_enabled && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Admin accounts require two-factor authentication. Set it up below to continue using admin features.
        </Alert>
      )}

      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {isAdmin
          ? 'Required for admin accounts. Adds a 6-digit code from an authenticator app on top of your password or magic link.'
          : 'Optional. Adds a 6-digit code from an authenticator app (like Google Authenticator or Authy) on top of your password or magic link.'}
      </Typography>

      {mfaError && <Alert severity="error" sx={{ mb: 2 }}>{mfaError}</Alert>}

      {mfaStep === 'idle' && !user?.mfa_enabled && (
        <Button variant="contained" onClick={() => startEnrollment(false)} disabled={mfaBusy}>
          Set Up Two-Factor Authentication
        </Button>
      )}

      {mfaStep === 'idle' && user?.mfa_enabled && !isAdmin && (
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          <Box>
            <TextField
              type="password"
              label="Current Password"
              name="current-password"
              autoComplete="current-password"
              value={mfaPassword}
              onChange={(e) => setMfaPassword(e.target.value)}
              size="small"
              sx={{ mr: 1, mb: 1 }}
            />
            <Button variant="outlined" onClick={() => startEnrollment(true)} disabled={mfaBusy || !mfaPassword}>
              Replace Authenticator
            </Button>
          </Box>
          <Button variant="outlined" color="warning" onClick={() => setDisableOpen(true)}>
            Disable
          </Button>
        </Box>
      )}

      {mfaStep === 'idle' && user?.mfa_enabled && isAdmin && (
        <Typography variant="body2" color="text.secondary">
          Admin accounts can't disable or replace their own two-factor authentication.
          Ask another admin to reset it from the Admin panel if you lose your device.
        </Typography>
      )}

      {mfaStep === 'enrolling' && (
        <Box component="form" onSubmit={confirmEnrollment} sx={{ mt: 2, maxWidth: 360 }}>
          <Typography variant="body2" sx={{ mb: 2 }}>
            Scan this QR code with your authenticator app, then enter the 6-digit code it shows.
          </Typography>
          {qrDataUri && (
            <Box sx={{ mb: 2, textAlign: 'center' }}>
              <img src={qrDataUri} alt="Two-factor authentication QR code" width={200} height={200} />
            </Box>
          )}
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>
            Can't scan it? Enter this key manually:
          </Typography>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
              mb: 2,
              bgcolor: 'action.hover',
              borderRadius: 1,
              pl: 1.5,
              pr: 0.5,
              py: 0.5,
            }}
          >
            <Typography
              variant="body2"
              component="code"
              sx={{ fontFamily: 'monospace', whiteSpace: 'nowrap', overflowX: 'auto', flex: 1 }}
            >
              {secret}
            </Typography>
            <Tooltip title={secretCopied ? 'Copied!' : 'Copy to clipboard'}>
              <IconButton size="small" onClick={copySecret} aria-label="Copy secret key to clipboard">
                {secretCopied ? <CheckIcon fontSize="small" color="success" /> : <ContentCopyIcon fontSize="small" />}
              </IconButton>
            </Tooltip>
          </Box>
          <TextField
            fullWidth
            label="Verification Code"
            name="otp"
            autoComplete="one-time-code"
            value={mfaCode}
            onChange={(e) => setMfaCode(e.target.value)}
            required
            autoFocus
            inputProps={{ inputMode: 'numeric', maxLength: 10 }}
            disabled={mfaBusy}
            sx={{ mb: 2 }}
          />
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button type="submit" variant="contained" disabled={mfaBusy}>
              Confirm
            </Button>
            <Button variant="outlined" onClick={finishEnrollment} disabled={mfaBusy}>
              Cancel
            </Button>
          </Box>
        </Box>
      )}

      {mfaStep === 'backup_codes' && (
        <Box sx={{ mt: 2, maxWidth: 400 }}>
          <Alert severity="success" sx={{ mb: 2 }}>Two-factor authentication is now enabled.</Alert>
          <Typography variant="body2" sx={{ mb: 1 }}>
            Save these one-time backup codes somewhere safe. Each one works once, in place of a
            code from your app, if you ever lose access to your authenticator.
          </Typography>
          <Box
            sx={{
              fontFamily: 'monospace',
              bgcolor: 'action.hover',
              borderRadius: 1,
              p: 2,
              mb: 2,
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 0.5,
            }}
          >
            {backupCodes.map((code) => (
              <Typography key={code} variant="body2" component="span">{code}</Typography>
            ))}
          </Box>
          <Button variant="contained" onClick={finishEnrollment}>
            I've Saved These Codes
          </Button>
        </Box>
      )}

      <Dialog open={disableOpen} onClose={() => setDisableOpen(false)}>
        <DialogTitle>Disable Two-Factor Authentication?</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Confirm your password to disable two-factor authentication on your account.
          </DialogContentText>
          {disableError && <Alert severity="error" sx={{ mb: 2 }}>{disableError}</Alert>}
          <TextField
            fullWidth
            type="password"
            label="Password"
            name="current-password"
            autoComplete="current-password"
            value={disablePassword}
            onChange={(e) => setDisablePassword(e.target.value)}
            autoFocus
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDisableOpen(false)} disabled={disableBusy}>Cancel</Button>
          <Button color="warning" variant="contained" onClick={handleDisable} disabled={disableBusy || !disablePassword}>
            Disable
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default SecurityTab;
