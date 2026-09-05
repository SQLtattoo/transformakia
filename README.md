# Transformakia — Πάγος vs Φωτιάς v6

Browser fighting game για τον Ορέστη, με δύο χαρακτήρες: Πάγος και Φωτιάς.

## Features
- 1 Player vs CPU
- 2 Players στην ίδια συσκευή
- 2 Players σε δύο συσκευές στο ίδιο Wi-Fi
- 4ψήφια room codes με Socket.IO
- Επίθεση → reaction defense → resolution → αλλαγή σειράς
- Άμυνες: Ασπίδα, Αποφυγή, Αντεπίθεση
- Sprite animations και battle effects και στις δύο συσκευές
- Ελληνικό voice feedback μέσω browser Speech Synthesis

## Local Wi-Fi

```bash
npm install
npm start
```

Laptop:

```text
http://localhost:3000
```

Άλλες συσκευές στο ίδιο Wi-Fi:

```text
http://<IPv4-laptop>:3000
```

Στα Windows βρίσκεις το IPv4 με:

```powershell
ipconfig
```

Αν το Windows Firewall ρωτήσει για Node.js, επίτρεψέ το στα Private networks.

## Current version
v6 — Reaction Battle
