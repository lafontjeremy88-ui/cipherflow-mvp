// pages/LegalNotice.jsx
// FIX P1 : TODO — remplacer [à compléter] par ton adresse réelle avant mise en prod
export default function LegalNotice() {
  return (
    <div
      style={{
        maxWidth: "900px",
        margin: "40px auto",
        padding: "20px",
        lineHeight: "1.6",
      }}
    >
      <h1>Mentions légales</h1>

      <p><strong>CipherFlow</strong></p>
      <p>Dernière mise à jour : 1 février 2026</p>

      <hr />

      <h2>1. Éditeur du site</h2>
      <p>Le présent site et l'application CipherFlow sont édités par :</p>
      <ul>
        <li><strong>Nom commercial :</strong> CipherFlow</li>
        <li><strong>Éditeur :</strong> Jérémy Lafont</li>
        {/* ⚠️ TODO P1 : remplacer par ton adresse réelle avant commercialisation */}
        <li><strong>Adresse :</strong> [À compléter avant mise en production]</li>
        <li><strong>Email :</strong> contact@cipherflow.company</li>
      </ul>
      <p>
        Le responsable de la publication est{" "}
        <strong>Jérémy Lafont</strong>, en qualité de fondateur de CipherFlow.
      </p>

      <h2>2. Hébergement</h2>
      <p>Les services de CipherFlow reposent sur plusieurs prestataires :</p>
      <h3>2.1 Frontend (interface web)</h3>
      <ul>
        <li>Hébergeur : Vercel Inc.</li>
        <li>Site : https://vercel.com</li>
      </ul>
      <h3>2.2 Backend (API et traitements)</h3>
      <ul>
        <li>Hébergeur : Railway</li>
        <li>Site : https://railway.app</li>
      </ul>
      <h3>2.3 Stockage des fichiers</h3>
      <ul>
        <li>Prestataire : Cloudflare R2 (stockage EU)</li>
        <li>Site : https://cloudflare.com</li>
      </ul>
      <p>
        Ces prestataires assurent l'hébergement technique de l'application.
        CipherFlow reste responsable de la configuration de la plateforme et
        de la sécurité logique au niveau de l'application.
      </p>

      <h2>3. Propriété intellectuelle</h2>
      <p>
        L'ensemble des éléments composant l'application CipherFlow (textes,
        interfaces, logos, composants graphiques, fonctionnalités,
        organisation des écrans, etc.) est protégé par le droit de la
        propriété intellectuelle.
      </p>
      <p>
        Toute reproduction, diffusion, modification ou exploitation non autorisée
        de tout ou partie de l'application est interdite sans l'autorisation préalable de l'éditeur.
      </p>

      <h2>4. Utilisation du service</h2>
      <p>
        CipherFlow est destiné à un usage professionnel, notamment par des
        syndics de copropriété, agences immobilières et gestionnaires de biens.
      </p>
      <p>
        L'utilisateur s'engage à utiliser la plateforme dans le respect des lois
        et réglementations en vigueur, et à ne pas y introduire de contenus
        illicites ou manifestement inappropriés.
      </p>

      <h2>5. Données personnelles</h2>
      <p>
        La gestion des données personnelles est décrite en détail dans notre{" "}
        <strong>Politique de confidentialité &amp; protection des données</strong>.
      </p>
      <p>
        Pour toute information concernant les finalités de traitement, les
        durées de conservation, les droits des personnes concernées et les
        engagements RGPD de CipherFlow, veuillez vous référer à la page{" "}
        <a href="/privacy">« Politique de confidentialité »</a>.
      </p>

      <h2>6. Limitation de responsabilité</h2>
      <p>
        CipherFlow met tout en œuvre pour assurer un fonctionnement fiable et
        sécurisé de la plateforme. Toutefois, l'éditeur ne saurait être tenu
        responsable des conséquences liées :
      </p>
      <ul>
        <li>à une mauvaise utilisation du service ;</li>
        <li>à des données inexactes, incomplètes ou illicites introduites par les utilisateurs ;</li>
        <li>
          à des interruptions temporaires liées à la maintenance, à des
          évolutions techniques ou à des incidents hors du contrôle raisonnable de l'éditeur.
        </li>
      </ul>

      <h2>7. Liens externes</h2>
      <p>
        L'application peut contenir des liens vers des sites ou services tiers.
        CipherFlow n'exerce aucun contrôle sur ces ressources externes et ne
        peut être tenue responsable de leur contenu ou de leur politique de
        confidentialité.
      </p>

      <h2>8. Contact</h2>
      <p>
        Pour toute question relative aux présentes mentions légales ou au
        fonctionnement de la plateforme :
        <br />
        📧 <strong>contact@cipherflow.company</strong>
      </p>
    </div>
  );
}
