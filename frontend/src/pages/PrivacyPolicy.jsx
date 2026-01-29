export default function PrivacyPolicy() {
  return (
    <div style={{ maxWidth: "900px", margin: "40px auto", padding: "20px", lineHeight: "1.6" }}>
      <h1>Politique de confidentialité & protection des données</h1>

      <p><strong>CipherFlow</strong></p>
      <p>Dernière mise à jour : 29 janvier 2026</p>

      <hr />

      <h2>1. Qui sommes-nous ?</h2>
      <p>
        CipherFlow est une solution SaaS d’automatisation et d’assistance à la gestion
        administrative et locative, destinée principalement aux syndics de copropriété,
        agences immobilières et gestionnaires de biens.
      </p>
      <p>
        CipherFlow agit en tant que <strong>sous-traitant</strong> au sens du Règlement Général
        sur la Protection des Données (RGPD).
        Les clients (syndics, agences immobilières) sont les <strong>responsables du traitement</strong>
        des données qu’ils utilisent dans la plateforme.
      </p>

      <h2>2. Quelles données sont traitées ?</h2>

      <h3>Données des utilisateurs professionnels</h3>
      <ul>
        <li>Adresse email</li>
        <li>Nom et prénom (optionnels)</li>
        <li>Paramètres de compte</li>
        <li>Préférences d’interface</li>
      </ul>

      <h3>Données liées à la gestion locative</h3>
      <ul>
        <li>Adresses email de candidats, locataires ou copropriétaires</li>
        <li>Contenu des emails reçus</li>
        <li>
          Pièces jointes transmises (exemples : bulletins de paie, avis d’imposition,
          pièces d’identité, factures, devis, quittances)
        </li>
      </ul>

      <h3>Données techniques</h3>
      <ul>
        <li>Identifiants internes</li>
        <li>Métadonnées de traitement (date, type de document, statut du dossier)</li>
        <li>Journaux techniques nécessaires à la sécurité et au bon fonctionnement du service</li>
      </ul>

      <p>
        <strong>
          CipherFlow ne collecte aucune donnée sans action explicite de l’utilisateur
          (email reçu, document transmis, action manuelle).
        </strong>
      </p>

      <h2>3. Finalités du traitement</h2>
      <ul>
        <li>Automatisation du traitement des emails entrants</li>
        <li>Analyse et classification de documents liés à la gestion locative</li>
        <li>Constitution et suivi des dossiers locataires</li>
        <li>Génération de réponses assistées</li>
        <li>Amélioration de la productivité des syndics et agences immobilières</li>
        <li>Sécurisation des échanges et traçabilité administrative</li>
      </ul>

      <p>
        Les données ne sont jamais utilisées à des fins commerciales externes
        et ne sont jamais revendues.
      </p>

      <h2>4. Base légale du traitement</h2>
      <ul>
        <li>L’intérêt légitime du responsable de traitement (syndic / agence)</li>
        <li>L’exécution d’un contrat (utilisation de CipherFlow)</li>
        <li>Le respect d’obligations légales liées à la gestion administrative</li>
      </ul>

      <h2>5. Utilisation de l’intelligence artificielle</h2>
      <p>
        CipherFlow utilise des services d’intelligence artificielle (notamment Google Gemini)
        afin d’analyser les emails, extraire des informations depuis des documents
        et assister la classification et la rédaction de réponses.
      </p>
      <ul>
        <li>Les données sont transmises uniquement pour exécuter la demande</li>
        <li>Les données ne sont pas revendues</li>
        <li>Les données ne sont pas utilisées pour entraîner des modèles propriétaires</li>
        <li>
          Les fichiers analysés sont stockés temporairement en clair uniquement
          le temps de l’analyse, puis supprimés
        </li>
      </ul>

      <h2>6. Sécurité des données</h2>

      <h3>Sécurité technique</h3>
      <ul>
        <li>Chiffrement des fichiers stockés sur disque</li>
        <li>Accès protégé par authentification (JWT)</li>
        <li>Isolation stricte des données par agence</li>
        <li>Suppression systématique des fichiers temporaires en clair</li>
        <li>Contrôle d’accès par rôle</li>
      </ul>

      <h3>Sécurité organisationnelle</h3>
      <ul>
        <li>Accès limité aux seules personnes autorisées</li>
        <li>Journalisation des actions sensibles</li>
        <li>Mise à jour régulière des dépendances et composants</li>
      </ul>

      <h2>7. Durée de conservation</h2>
      <ul>
        <li>Données actives : conservées tant que le compte agence est actif</li>
        <li>Emails et documents : conservés pour les besoins de la gestion locative</li>
        <li>Suppression complète : effectuée sur demande ou lors de la suppression du compte</li>
      </ul>

      <p>
        CipherFlow ne conserve aucune donnée au-delà de ce qui est strictement nécessaire.
      </p>

      <h2>8. Droits des personnes concernées</h2>
      <p>
        Conformément au RGPD, les personnes concernées disposent des droits suivants :
      </p>
      <ul>
        <li>Droit d’accès</li>
        <li>Droit de rectification</li>
        <li>Droit à l’effacement (droit à l’oubli)</li>
        <li>Droit à la limitation du traitement</li>
        <li>Droit d’opposition</li>
        <li>Droit à la portabilité des données</li>
      </ul>

      <p>
        Les demandes peuvent être effectuées via l’agence responsable du traitement
        ou via les fonctionnalités de suppression disponibles dans l’application.
      </p>

      <h2>9. Suppression et droit à l’oubli</h2>
      <p>
        CipherFlow permet la suppression complète des utilisateurs, des agences,
        des fichiers stockés et des données associées en base de données.
      </p>
      <p>
        Ces actions entraînent un effacement définitif et irréversible des données.
      </p>

      <h2>10. Sous-traitants et hébergement</h2>
      <p>
        Les données peuvent être hébergées ou traitées par des prestataires techniques
        sélectionnés pour leur conformité et leur fiabilité (hébergement, email, IA).
      </p>

      <h2>11. Transferts hors Union Européenne</h2>
      <p>
        Certains services peuvent impliquer des transferts de données hors UE.
        Dans ce cas, CipherFlow s’assure que des garanties appropriées sont mises en place.
      </p>

      <h2>12. Évolution de la politique</h2>
      <p>
        Cette politique peut être mise à jour afin de refléter des évolutions réglementaires,
        techniques ou fonctionnelles.
      </p>

      <h2>13. Contact</h2>
      <p>
        Pour toute question relative à la protection des données :
        <br />
        <strong>📧 contact@cipherflow.company</strong>
      </p>
    </div>
  );
}