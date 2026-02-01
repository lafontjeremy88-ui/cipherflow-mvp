export default function PrivacyPolicy() {
  return (
    <div
      style={{
        maxWidth: "900px",
        margin: "40px auto",
        padding: "20px",
        lineHeight: "1.6",
      }}
    >
      <h1>Politique de confidentialité & protection des données</h1>

      <p>
        <strong>CipherFlow</strong>
      </p>
      <p>Dernière mise à jour : 1 février 2026</p>

      <hr />

      <h2>1. Qui sommes-nous ?</h2>
      <p>
        CipherFlow est une solution SaaS d’automatisation et d’assistance à la
        gestion administrative et locative, destinée principalement aux syndics
        de copropriété, agences immobilières et gestionnaires de biens.
      </p>

      <p>
        Dans le cadre de l’utilisation de la plateforme, il convient de
        distinguer deux situations :
      </p>
      <ul>
        <li>
          Pour les données des <strong>utilisateurs professionnels</strong> de la
          plateforme (comptes administrateurs, collaborateurs d’une agence),
          CipherFlow agit en qualité de{" "}
          <strong>responsable de traitement</strong>.
        </li>
        <li>
          Pour les données des <strong>locataires, candidats, propriétaires ou
          copropriétaires</strong> introduites par les clients (syndics, agences
          immobilières, gestionnaires), ces clients agissent en qualité de{" "}
          <strong>responsables de traitement</strong>, et CipherFlow agit en
          qualité de <strong>sous-traitant</strong> au sens de l’article 28 du
          RGPD, en traitant ces données uniquement pour leur compte et sur leur
          instruction.
        </li>
      </ul>

      <h2>2. Quelles données sont traitées ?</h2>

      <p>
        CipherFlow ne collecte ni n’introduit de données de sa propre
        initiative. Toutes les données proviennent d’actions explicites des
        utilisateurs (emails reçus, documents transmis, saisies manuelles).
      </p>

      <h3>Données des utilisateurs professionnels</h3>
      <ul>
        <li>Adresse email professionnelle</li>
        <li>Nom et prénom (optionnels)</li>
        <li>Paramètres de compte</li>
        <li>Préférences d’interface (langue, affichage, etc.)</li>
        <li>Journaux de connexion et événements techniques liés à la sécurité</li>
      </ul>

      <h3>Données liées à la gestion locative</h3>
      <ul>
        <li>Adresses email de candidats, locataires, propriétaires ou copropriétaires</li>
        <li>Contenu des emails reçus et envoyés via la plateforme</li>
        <li>
          Pièces jointes transmises (exemples : bulletins de paie, avis
          d’imposition, pièces d’identité, factures, devis, quittances)
        </li>
        <li>
          Informations dérivées de ces documents (type de document, montants,
          dates, statut du dossier, indicateurs fonctionnels)
        </li>
      </ul>

      <h3>Données techniques</h3>
      <ul>
        <li>Identifiants internes et métadonnées de traitement</li>
        <li>Horodatages de création, modification et clôture des dossiers</li>
        <li>
          Journaux techniques nécessaires à la sécurité, au diagnostic et au bon
          fonctionnement du service
        </li>
      </ul>

      <p>
        La plateforme n’a pas vocation à traiter des données de santé ni des
        données de mineurs. Si de telles données sont introduites par une
        agence, celle-ci en reste seule responsable au regard du RGPD.
      </p>

      <h2>3. Finalités du traitement</h2>
      <p>
        Les données sont traitées pour les finalités suivantes, pour le compte
        des agences clientes :
      </p>
      <ul>
        <li>Automatisation du traitement et de la priorisation des emails entrants</li>
        <li>Analyse et classification des documents liés à la gestion locative</li>
        <li>Constitution, suivi et mise à jour des dossiers locataires</li>
        <li>Génération de réponses assistées et de propositions de messages</li>
        <li>Génération de factures, quittances et documents administratifs</li>
        <li>Sécurisation des échanges et traçabilité administrative</li>
      </ul>

      <p>
        Pour les utilisateurs professionnels, les données sont également
        traitées pour :
      </p>
      <ul>
        <li>Créer et gérer les comptes utilisateurs</li>
        <li>Assurer l’authentification et la sécurité des accès</li>
        <li>Assurer le support et l’amélioration continue du service</li>
      </ul>

      <p>
        Les données ne sont jamais utilisées à des fins commerciales externes et
        ne sont jamais revendues.
      </p>

      <h2>4. Base légale du traitement</h2>
      <ul>
        <li>
          <strong>Exécution d’un contrat</strong> : fourniture du service
          CipherFlow aux agences clientes et gestion des comptes utilisateurs.
        </li>
        <li>
          <strong>Intérêt légitime</strong> des responsables de traitement
          (syndics, agences) pour organiser, suivre et sécuriser leur gestion
          locative et administrative.
        </li>
        <li>
          Le cas échéant, <strong>respect d’obligations légales</strong> liées à
          la gestion administrative et comptable.
        </li>
      </ul>

      <h2>5. Utilisation de l’intelligence artificielle</h2>
      <p>
        CipherFlow utilise des services d’intelligence artificielle (par
        exemple, Google Gemini) afin d’analyser le contenu des emails, extraire
        des informations depuis des documents et assister la classification et
        la rédaction de réponses.
      </p>
      <ul>
        <li>
          Les données sont transmises aux services d’IA uniquement dans la
          mesure nécessaire pour exécuter la demande formulée par l’utilisateur.
        </li>
        <li>
          CipherFlow n’utilise pas ces données pour entraîner ses propres
          modèles d’IA à des fins générales.
        </li>
        <li>
          Les données ne sont jamais revendues par CipherFlow ni utilisées à des
          fins publicitaires.
        </li>
        <li>
          Les fichiers analysés peuvent être stockés temporairement en clair le
          temps strictement nécessaire à l’analyse, avant d’être chiffrés ou
          supprimés.
        </li>
      </ul>
      <p>
        Les fournisseurs de services d’IA traitent ces données conformément à
        leurs propres conditions d’utilisation et politiques de confidentialité.
      </p>

      <h2>6. Sécurité des données</h2>

      <h3>Sécurité technique</h3>
      <ul>
        <li>Chiffrement des fichiers stockés sur disque (pièces jointes, documents)</li>
        <li>Chiffrement des communications entre le navigateur et l’API (HTTPS/TLS)</li>
        <li>
          Accès protégé par authentification avec jetons d’accès de courte durée
          et jetons de renouvellement stockés en cookies sécurisés (HttpOnly)
        </li>
        <li>Isolation stricte des données par agence via un identifiant d’agence</li>
        <li>Suppression systématique des fichiers temporaires en clair</li>
        <li>Contrôle d’accès par rôle au sein de la plateforme</li>
      </ul>

      <h3>Sécurité organisationnelle</h3>
      <ul>
        <li>Accès limité aux seules personnes habilitées</li>
        <li>Journalisation des actions sensibles et des erreurs techniques</li>
        <li>
          Mise à jour régulière des composants logiciels et dépendances de
          sécurité
        </li>
      </ul>

      <h2>7. Durée de conservation</h2>
      <p>
        CipherFlow applique des politiques de rétention configurables par
        l’agence, avec des durées par défaut pensées pour limiter la
        conservation des données.
      </p>
      <ul>
        <li>
          <strong>Emails analysés</strong> : conservés par défaut 12 mois à
          compter de leur création, puis supprimés.
        </li>
        <li>
          <strong>Analyses de fichiers / pièces jointes</strong> : conservées
          par défaut 12 mois, avec suppression des analyses et des fichiers
          chiffrés au-delà de cette durée.
        </li>
        <li>
          <strong>Dossiers locataires clôturés</strong> : les informations
          permettant d’identifier directement le candidat ou locataire (nom,
          email, indicateur de risque) peuvent être anonymisées après une
          durée maximale de 5 ans à compter de la clôture, sauf obligation
          légale contraire de l’agence.
        </li>
        <li>
          <strong>Comptes utilisateurs et données d’agence</strong> : conservés
          pendant la durée du contrat et supprimés ou anonymisés en cas de
          résiliation ou de demande de suppression.
        </li>
      </ul>

      <p>
        CipherFlow ne conserve pas les données au-delà de ce qui est
        strictement nécessaire aux finalités décrites ci-dessus et aux
        obligations contractuelles ou légales des agences clientes.
      </p>

      <h2>8. Droits des personnes concernées</h2>
      <p>
        Conformément au RGPD, les personnes concernées disposent notamment des
        droits suivants :
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
        Pour les données traitées dans le cadre de la gestion locative, ces
        droits doivent être exercés en priorité auprès de{" "}
        <strong>l’agence responsable de traitement</strong> (syndic, agence
        immobilière, gestionnaire de biens), qui reste votre interlocuteur
        principal.
      </p>
      <p>
        CipherFlow assiste les agences, dans la mesure du possible, pour
        répondre à ces demandes (suppression de compte, purge d’agence, aide à
        l’export ou à la suppression de données).
      </p>

      <h2>9. Suppression et droit à l’oubli</h2>
      <p>
        CipherFlow permet la suppression complète d’un utilisateur, et lorsque
        les conditions sont réunies, la suppression ou la purge d’une agence
        (dossiers, emails analysés, documents chiffrés, factures, liens
        associés).
      </p>
      <p>
        Ces opérations entraînent un effacement définitif et irréversible des
        données au niveau de la plateforme, sous réserve des obligations
        légales de conservation qui peuvent incomber à l’agence responsable de
        traitement.
      </p>

      <h2>10. Sous-traitants et hébergement</h2>
      <p>
        Pour fournir le service, CipherFlow peut faire appel à des prestataires
        techniques (hébergeurs, services d’envoi d’emails, fournisseurs
        d’outils d’IA, etc.). Ces prestataires sont sélectionnés pour leur
        fiabilité et leur niveau de conformité en matière de sécurité et de
        protection des données.
      </p>
      <p>
        CipherFlow s’engage à encadrer ces relations contractuellement et à ne
        recourir qu’à des prestataires présentant des garanties suffisantes au
        sens du RGPD.
      </p>

      <h2>11. Transferts hors Union Européenne</h2>
      <p>
        Certains services techniques (par exemple, services d’emailing ou
        d’intelligence artificielle) peuvent impliquer des transferts de données
        hors de l’Union européenne.
      </p>
      <p>
        Dans ce cas, CipherFlow veille à ce que ces transferts soient encadrés
        par des mécanismes de protection appropriés (tels que des clauses
        contractuelles types approuvées par la Commission européenne ou des
        mesures de protection équivalentes), dans la mesure où cela est
        applicable.
      </p>

      <h2>12. Évolution de la politique</h2>
      <p>
        Cette politique peut être mise à jour afin de refléter des évolutions
        réglementaires, techniques ou fonctionnelles de la plateforme. La date
        de dernière mise à jour est indiquée en tête de document.
      </p>

      <h2>13. Contact</h2>
      <p>
        Pour toute question relative à la protection des données ou à cette
        politique de confidentialité :
        <br />
        <strong>📧 contact@cipherflow.company</strong>
      </p>
    </div>
  );
}
