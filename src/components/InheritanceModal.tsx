import { useState } from 'react';
import type { HeirContact, SpendingConditions } from '../types';
import { createInheritanceAccount } from '../services/wallet';
import { DEFAULT_HEIR, DEFAULT_INHERITANCE_CONDITIONS } from '../constants';
import './Modal.css';

interface InheritanceModalProps {
  mnemonic: string;
  onClose: () => void;
}

export function InheritanceModal({ mnemonic, onClose }: InheritanceModalProps) {
  const [step, setStep] = useState(1);
  const [selectedHeir, setSelectedHeir] = useState<HeirContact | null>(null);
  const [conditions, setConditions] = useState<SpendingConditions>(DEFAULT_INHERITANCE_CONDITIONS);
  const [accountName, setAccountName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const heirs: HeirContact[] = [DEFAULT_HEIR];

  const handleCreate = async () => {
    if (!selectedHeir || !accountName) return;

    setIsCreating(true);
    try {
      await createInheritanceAccount(mnemonic, accountName, selectedHeir, conditions);
      onClose();
    } catch (error) {
      console.error('Error creating inheritance account:', error);
    } finally {
      setIsCreating(false);
    }
  };

  const renderStep1 = () => (
    <div>
      <h3>Vyberte dědice</h3>
      <p className="step-description">
        Vyberte osobu, která bude mít přístup k prostředkům v případě, že vy je nebudete moci používat.
      </p>
      
      <div className="heir-list">
        {heirs.map(heir => (
          <div
            key={heir.id}
            className={`heir-item ${selectedHeir?.id === heir.id ? 'selected' : ''}`}
            onClick={() => setSelectedHeir(heir)}
          >
            <div className="heir-icon">👤</div>
            <div className="heir-info">
              <div className="heir-name">{heir.name}</div>
              <div className="heir-key">{heir.publicKey.slice(0, 20)}...</div>
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={() => setStep(2)}
        disabled={!selectedHeir}
        className="btn-primary btn-full"
      >
        Pokračovat
      </button>
    </div>
  );

  const renderStep2 = () => (
    <div>
      <h3>Podmínky utrácení</h3>
      <p className="step-description">
        Nastavte časové podmínky pro utrácení z tohoto účtu.
      </p>

      <div className="conditions-list">
        <div className="condition-item">
          <div className="condition-label">Počáteční blokáda</div>
          <div className="condition-value">
            <input
              type="number"
              value={conditions.noSpendBlocks}
              onChange={(e) => setConditions({...conditions, noSpendBlocks: parseInt(e.target.value) || 0})}
              className="condition-input"
            />
            <span>bloků</span>
          </div>
          <div className="condition-desc">Nikdo nemůže utrácet</div>
        </div>

        <div className="condition-item">
          <div className="condition-label">Multisig období</div>
          <div className="condition-value">
            <input
              type="number"
              value={conditions.multisigAfterBlocks}
              onChange={(e) => setConditions({...conditions, multisigAfterBlocks: parseInt(e.target.value) || 0})}
              className="condition-input"
            />
            <span>bloků</span>
          </div>
          <div className="condition-desc">Vyžadován podpis vás i dědice</div>
        </div>

        <div className="condition-item">
          <div className="condition-label">Uživatel může utrácet</div>
          <div className="condition-value">
            <input
              type="number"
              value={conditions.userOnlyAfterBlocks}
              onChange={(e) => setConditions({...conditions, userOnlyAfterBlocks: parseInt(e.target.value) || 0})}
              className="condition-input"
            />
            <span>bloků</span>
          </div>
          <div className="condition-desc">Stačí váš podpis</div>
        </div>

        <div className="condition-item">
          <div className="condition-label">Dědic může utrácet</div>
          <div className="condition-value">
            <input
              type="number"
              value={conditions.heirOnlyAfterBlocks}
              onChange={(e) => setConditions({...conditions, heirOnlyAfterBlocks: parseInt(e.target.value) || 0})}
              className="condition-input"
            />
            <span>bloků</span>
          </div>
          <div className="condition-desc">Stačí podpis dědice</div>
        </div>
      </div>

      <div className="button-group-row">
        <button onClick={() => setStep(1)} className="btn-secondary">
          Zpět
        </button>
        <button onClick={() => setStep(3)} className="btn-primary">
          Pokračovat
        </button>
      </div>
    </div>
  );

  const renderStep3 = () => (
    <div>
      <h3>Pojmenování účtu</h3>
      <p className="step-description">
        Zadejte název pro tento dědický účet.
      </p>

      <div className="form-group">
        <label>Název účtu</label>
        <input
          type="text"
          value={accountName}
          onChange={(e) => setAccountName(e.target.value)}
          placeholder="např. Dědický účet - Rodina"
          className="form-input"
        />
      </div>

      <div className="summary-box">
        <h4>Souhrn</h4>
        <div className="summary-item">
          <span>Dědic:</span>
          <span>{selectedHeir?.name}</span>
        </div>
        <div className="summary-item">
          <span>Blokáda:</span>
          <span>{conditions.noSpendBlocks} bloků</span>
        </div>
        <div className="summary-item">
          <span>Multisig od:</span>
          <span>{conditions.multisigAfterBlocks} bloků</span>
        </div>
        <div className="summary-item">
          <span>Váš přístup od:</span>
          <span>{conditions.userOnlyAfterBlocks} bloků</span>
        </div>
        <div className="summary-item">
          <span>Dědicův přístup od:</span>
          <span>{conditions.heirOnlyAfterBlocks} bloků</span>
        </div>
      </div>

      <div className="button-group-row">
        <button onClick={() => setStep(2)} className="btn-secondary">
          Zpět
        </button>
        <button 
          onClick={handleCreate}
          disabled={!accountName || isCreating}
          className="btn-primary"
        >
          {isCreating ? 'Vytváření...' : 'Vytvořit účet'}
        </button>
      </div>
    </div>
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-large" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Přidat dědický účet</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          <div className="step-indicator">
            <div className={`step ${step >= 1 ? 'active' : ''}`}>1</div>
            <div className={`step ${step >= 2 ? 'active' : ''}`}>2</div>
            <div className={`step ${step >= 3 ? 'active' : ''}`}>3</div>
          </div>

          {step === 1 && renderStep1()}
          {step === 2 && renderStep2()}
          {step === 3 && renderStep3()}
        </div>
      </div>
    </div>
  );
}