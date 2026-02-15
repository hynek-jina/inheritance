import { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import type { Account } from '../types';
import { getNextUnusedAddress, generateNewAddress } from '../services/wallet';
import './Modal.css';

interface ReceiveModalProps {
  account: Account;
  mnemonic: string;
  onClose: () => void;
}

export function ReceiveModal({ account, mnemonic, onClose }: ReceiveModalProps) {
  const [address, setAddress] = useState<string>('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const loadAddress = async () => {
      const unused = getNextUnusedAddress(account);
      if (unused) {
        setAddress(unused.address);
      } else {
        // Generate new address
        const newAddr = await generateNewAddress(mnemonic, account);
        setAddress(newAddr.address);
      }
    };

    loadAddress();
  }, [account, mnemonic]);

  const handleCopy = () => {
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Přijmout Bitcoin</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          <p className="modal-description">
            Naskenujte QR kód nebo zkopírujte adresu pro příjem testnet bitcoinů
          </p>

          <div className="qr-container">
            {address ? (
              <QRCodeSVG 
                value={address}
                size={200}
                level="M"
                bgColor="#ffffff"
                fgColor="#000000"
              />
            ) : (
              <div className="qr-loading">Načítání...</div>
            )}
          </div>

          <div className="address-box">
            <code className="address-text">{address}</code>
            <button 
              onClick={handleCopy}
              className={`copy-btn ${copied ? 'copied' : ''}`}
            >
              {copied ? '✓ Zkopírováno' : 'Kopírovat'}
            </button>
          </div>

          <div className="network-badge">
            Testnet adresy začínají na "tb1..."
          </div>
        </div>
      </div>
    </div>
  );
}