import { FormEvent } from "react";
import { SOCIETE } from "./PublicLayout";
import PageHero from "./PageHero";
import { IcPin, IcPhone, IcMail } from "./icons";

export default function Contact() {
  // Ouvre le client e-mail du visiteur, pré-rempli (aucun backend requis).
  function envoyer(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const sujet = encodeURIComponent(`Demande de devis — ${f.get("nom")}`);
    const corps = encodeURIComponent(
      `Nom : ${f.get("nom")}\nE-mail : ${f.get("email")}\nTéléphone : ${f.get("tel") || "-"}\n\n${f.get("message")}`
    );
    window.location.href = `mailto:${SOCIETE.email}?subject=${sujet}&body=${corps}`;
  }

  return (
    <>
      <PageHero titre="Contact" sous="Une question, un devis ? Écrivez-nous, nous vous répondons rapidement." />
      <section className="pub-section">
        <div className="pub-contact">
          <div className="pub-infos">
            <div className="pub-info"><div className="pub-ico pub-ico-gold"><IcPin /></div><div><strong>Adresse</strong><p>{SOCIETE.adresse}</p></div></div>
            <div className="pub-info"><div className="pub-ico pub-ico-gold"><IcPhone /></div><div><strong>Téléphone</strong><p><a href={`tel:${SOCIETE.tel.replace(/\s/g, "")}`}>{SOCIETE.tel}</a></p></div></div>
            <div className="pub-info"><div className="pub-ico pub-ico-gold"><IcMail /></div><div><strong>E-mail</strong><p><a href={`mailto:${SOCIETE.email}`}>{SOCIETE.email}</a></p></div></div>
          </div>
          <form onSubmit={envoyer} className="pub-form">
            <div className="pub-form-2">
              <label>Nom<input name="nom" required /></label>
              <label>Téléphone<input name="tel" /></label>
            </div>
            <label>E-mail<input name="email" type="email" required /></label>
            <label>Message<textarea name="message" rows={6} required /></label>
            <button className="pub-btn" type="submit">Envoyer ma demande</button>
          </form>
        </div>
      </section>
    </>
  );
}
