import { useState } from 'react';
import type { Account } from '../types';
import './Modal.css';

interface SendModalProps {
  account: Account;
  mnemonic: string;
  onClose: () => void;
  onSent: () => void;
}

export function SendModal({ account, onClose, onSent }: SendModalProps) {
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [fee, setFee] = useState('5');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const validateAddress = (addr: string): boolean => {
    // Simple validation - testnet addresses start with tb1, m, n, or 2
    return addr.startsWith('tb1') || addr.startsWith('m') || addr.startsWith('n') || addr.startsWith('2');
  };

  const handleSend = async () => {
    setError('');
    setSuccess('');

    // Validation
    if (!validateAddress(recipient)) {
      setError('Neplatná testnet adresa');
      return;
    }

    const amountBtc = parseFloat(amount);
    if (isNaN(amountBtc) || amountBtc <= 0) {
      setError('Zadejte platnou částku');
      return;
    }

    const feeRate = parseInt(fee);
    if (isNaN(feeRate) || feeRate <= 0) {
      setError('Zadejte platný fee');
      return;
    }

    if (amountBtc > account.balance) {
      setError('Nedostatek prostředků');
      return;
    }

    setIsSending(true);

    try {
      // Note: Full Taproot transaction signing requires complex implementation
      // For this demo version, we'll show a message that the UI is ready
      // but actual transaction creation would require additional work
      
      setSuccess('Odesílání transakcí je v testovací verzi připraveno. Pro plnou funkčnost je potřeba dokončit implementaci Taproot podpisu.');
      
      // TODO: Implement full Taproot transaction signing
      // This requires:
      // 1. UTXO gathering
      // 2. PSBT creation with Taproot inputs
      // 3. Proper Schnorr signature calculation
      // 4. Transaction broadcasting
      
      setTimeout(() => {
        onSent();
        onClose();
      }, 3000);

    } catch (err: any) {
      setError(err.message || 'Chyba při odesílání');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Odeslat Bitcoin</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          <div className="form-group">
            <label>Adresa příjemce</label>
            <input
              type="text"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="tb1..."
              className="form-input"
            />
          </div>

          <div className="form-group">
            <label>Částka (BTC)</label>
            <input
              type="number"
              step="0.00000001"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00000000"
              className="form-input"
            />
            <div className="input-hint">
              Dostupné: {account.balance.toFixed(8)} BTC
            </div>
          </div>

          <div className="form-group">
            <label>Fee (sat/vB)</label>
            <div className="fee-options">
              <button 
                onClick={() => setFee('1')}
                className={`fee-btn ${fee === '1' ? 'active' : ''}`}
              >
                Slow (1)
              </button>
              <button 
                onClick={() => setFee('5')}
                className={`fee-btn ${fee === '5' ? 'active' : ''}`}
              >
                Normal (5)
              </button>
              <button 
                onClick={() => setFee('20')}
                className={`fee-btn ${fee === '20' ? 'active' : ''}`}
              >
                Fast (20)
              </button>
            </div>
          </div>

          {error && <div className="error-message">{error}</div>}
          {success && <div className="success-message">{success}</div>}

          <button
            onClick={handleSend}
            disabled={isSending || !recipient || !amount}
            className="btn-primary btn-full"
          >
            {isSending ? 'Odesílání...' : 'Odeslat'}
          </button>
        </div>
      </div>
    </div>
  );
}