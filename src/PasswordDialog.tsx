import { useState } from 'react';
import { Check } from 'lucide-react';
import { patch } from './api';
import { Modal } from './components';

export default function PasswordDialog({ onClose }: { onClose: () => void }) {
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <Modal title="修改密码" onClose={() => !busy && onClose()}>
      <form
        className="password-form"
        onSubmit={async (event) => {
          event.preventDefault();
          if (password !== confirmation) {
            setError('两次输入的新密码不一致');
            return;
          }
          setBusy(true);
          try {
            await patch('/account/password', { currentPassword: current, newPassword: password });
            window.location.assign('/login');
          } catch (reason) {
            setError((reason as Error).message);
            setBusy(false);
          }
        }}
      >
        <label className="form-label">
          当前密码
          <input
            className="text-input"
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            required
            maxLength={128}
          />
        </label>
        <label className="form-label">
          新密码
          <input
            className="text-input"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={10}
            maxLength={128}
          />
        </label>
        <label className="form-label">
          确认新密码
          <input
            className="text-input"
            type="password"
            autoComplete="new-password"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            required
            minLength={10}
            maxLength={128}
          />
        </label>
        <p className="muted small">密码至少 10 位。修改成功后，需要在各设备重新登录。</p>
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button className="btn btn-primary" disabled={busy}>
            <Check size={16} />
            {busy ? '保存中' : '更新密码'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
