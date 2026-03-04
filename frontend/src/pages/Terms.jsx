import React from "react";

/**
 * Conditions Générales d'Utilisation — CipherFlow
 *
 * SaaS B2B à destination des agences immobilières et syndics.
 */
export default function Terms() {
  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <h1 style={styles.h1}>Conditions Générales d'Utilisation</h1>
        <p style={styles.meta}>En vigueur au 1er janvier 2025 — CipherFlow SAS</p>

        <Section title="1. Objet">
          <p>
            Les présentes Conditions Générales d'Utilisation (CGU) régissent l'accès et l'utilisation
            de la plateforme CipherFlow (ci-après « le Service »), éditée par CipherFlow SAS, à
            destination des professionnels de l'immobilier (agences, syndics, gestionnaires).
          </p>
        </Section>

        <Section title="2. Acceptation">
          <p>
            L'utilisation du Service implique l'acceptation pleine et entière des présentes CGU.
            Tout accès au Service par un utilisateur professionnel vaut acceptation sans réserve.
            Ces CGU peuvent être modifiées à tout moment ; les utilisateurs seront informés par
            email au moins 30 jours avant toute modification substantielle.
          </p>
        </Section>

        <Section title="3. Description du Service">
          <p>CipherFlow est une plateforme SaaS qui automatise :</p>
          <ul>
            <li>La réception et l'analyse des emails de candidature locative</li>
            <li>L'extraction et la classification des pièces justificatives par IA</li>
            <li>La génération de réponses automatisées aux candidats</li>
            <li>La constitution et le suivi des dossiers locataires</li>
          </ul>
        </Section>

        <Section title="4. Accès au Service">
          <p>
            L'accès au Service est réservé aux professionnels disposant d'un compte validé.
            Chaque agence constitue un tenant isolé ; les données d'un tenant ne sont pas
            accessibles aux autres tenants. L'utilisateur est responsable de la confidentialité
            de ses identifiants.
          </p>
        </Section>

        <Section title="5. Données personnelles">
          <p>
            CipherFlow traite des données à caractère personnel (coordonnées des candidats,
            documents d'identité, justificatifs de revenus) pour le compte de l'agence,
            qui agit en qualité de responsable de traitement. CipherFlow agit en qualité
            de sous-traitant au sens du RGPD.
          </p>
          <p>
            Les données sont hébergées dans l'Union européenne. Les durées de conservation
            sont configurables par l'agence (rétention RGPD automatisée). Un DPA (Data
            Processing Agreement) est disponible sur demande à{" "}
            <a href="mailto:dpo@cipherflow.company" style={styles.link}>
              dpo@cipherflow.company
            </a>.
          </p>
        </Section>

        <Section title="6. Propriété intellectuelle">
          <p>
            L'ensemble des éléments constituant le Service (logiciel, algorithmes IA, interface,
            base de données) est la propriété exclusive de CipherFlow SAS et est protégé par
            le droit de la propriété intellectuelle. L'utilisateur ne bénéficie que d'un droit
            d'usage non exclusif et non transférable.
          </p>
        </Section>

        <Section title="7. Responsabilité">
          <p>
            CipherFlow SAS met en œuvre les moyens raisonnables pour assurer la disponibilité
            du Service (objectif SLA 99,5 % mensuel) mais ne saurait être tenu responsable des
            interruptions dues à des maintenances planifiées, des causes extérieures ou des
            forces majeures.
          </p>
          <p>
            Les analyses produites par l'IA sont fournies à titre d'aide à la décision et ne
            se substituent pas au jugement professionnel de l'utilisateur. CipherFlow SAS
            décline toute responsabilité pour les décisions prises sur la seule base de ces analyses.
          </p>
        </Section>

        <Section title="8. Tarification et facturation">
          <p>
            Les conditions tarifaires sont définies dans le devis ou l'offre acceptée par
            l'agence. Les abonnements sont facturés mensuellement ou annuellement selon le
            plan choisi. Toute période commencée est due en intégralité.
          </p>
        </Section>

        <Section title="9. Résiliation">
          <p>
            L'utilisateur peut résilier son compte à tout moment depuis l'espace « Mon compte ».
            Les données sont conservées 30 jours après résiliation pour permettre un éventuel
            export, puis supprimées définitivement conformément à la politique de rétention RGPD.
          </p>
        </Section>

        <Section title="10. Droit applicable">
          <p>
            Les présentes CGU sont soumises au droit français. Tout litige relatif à leur
            interprétation ou à leur exécution relève de la compétence exclusive des tribunaux
            de Paris, sauf disposition légale contraire.
          </p>
          <p>
            Pour toute question relative aux CGU :{" "}
            <a href="mailto:legal@cipherflow.company" style={styles.link}>
              legal@cipherflow.company
            </a>
          </p>
        </Section>

        <p style={{ ...styles.meta, marginTop: "2rem" }}>
          <a href="/privacy" style={styles.link}>Politique de confidentialité</a>
          {" · "}
          <a href="/mentions-legales" style={styles.link}>Mentions légales</a>
        </p>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section style={{ marginBottom: "2rem" }}>
      <h2 style={styles.h2}>{title}</h2>
      <div style={styles.body}>{children}</div>
    </section>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "var(--bg, #0f1117)",
    padding: "3rem 1.5rem",
  },
  container: {
    maxWidth: 720,
    margin: "0 auto",
  },
  h1: {
    fontSize: "2rem",
    fontWeight: 700,
    color: "var(--text, #f1f5f9)",
    marginBottom: "0.5rem",
  },
  h2: {
    fontSize: "1.1rem",
    fontWeight: 600,
    color: "var(--text, #f1f5f9)",
    marginBottom: "0.5rem",
  },
  body: {
    color: "rgba(255,255,255,0.75)",
    lineHeight: 1.7,
    fontSize: "0.95rem",
  },
  meta: {
    color: "rgba(255,255,255,0.45)",
    fontSize: "0.875rem",
    marginBottom: "2.5rem",
  },
  link: {
    color: "var(--accent, #6366f1)",
    textDecoration: "underline",
  },
};
