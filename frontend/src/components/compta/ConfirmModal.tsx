import { Modal } from "../Modal";

interface Props {
  titre: string;
  message: string;
  libelleConfirmer?: string;
  enCours?: boolean;
  onConfirmer: () => void;
  onAnnuler: () => void;
}

/** Confirmation avant action destructrice (suppression…). */
export function ConfirmModal({ titre, message, libelleConfirmer = "Supprimer", enCours, onConfirmer, onAnnuler }: Props) {
  return (
    <Modal title={titre} onClose={onAnnuler}>
      <p style={{ marginTop: 0 }}>{message}</p>
      <div className="form-actions">
        <button className="btn secondary" onClick={onAnnuler} disabled={enCours}>
          Annuler
        </button>
        <button className="btn danger" onClick={onConfirmer} disabled={enCours}>
          {enCours ? "…" : libelleConfirmer}
        </button>
      </div>
    </Modal>
  );
}
