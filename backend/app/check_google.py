import sys
from importlib.metadata import distributions

def lister_bibliotheques_google():
    print(f"--- Recherche des bibliothèques Google dans : {sys.executable} ---")
    print(f"{'Nom du paquet':<30} | {'Version':<15}")
    print("-" * 50)
    
    google_libs = []
    
    # On parcourt tous les paquets installés
    for dist in distributions():
        name = dist.metadata['Name']
        # On garde ceux qui contiennent 'google' (insensible à la casse)
        if "google" in name.lower():
            google_libs.append((name, dist.version))
            
    # On trie et on affiche
    if google_libs:
        for name, version in sorted(google_libs):
            print(f"{name:<30} | {version:<15}")
    else:
        print("Aucune bibliothèque Google trouvée.")

if __name__ == "__main__":
    lister_bibliotheques_google()