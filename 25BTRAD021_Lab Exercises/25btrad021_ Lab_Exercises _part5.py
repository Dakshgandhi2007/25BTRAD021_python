# Lab Experiments (Unit 5) - Combined Program
# Lab 14: Bank Account System (OOP) | Lab 15: Library Management | Lab 16: Dice Simulator
# Author: Daksh Gandhi | CSE-AIDE-A, JAIN (Deemed-to-be University)
import random


def get_amount(prompt):
    """Read a number from the user; return None if it isn't a valid number."""
    try:
        return float(input(prompt))
    except ValueError:
        print("Invalid amount. Please enter a number.")
        return None


# ----- Lab 14: Bank Account System -----
class BankAccount:
    def __init__(self, acc_no, holder, opening_balance=0):
        self.acc_no = acc_no
        self.holder = holder
        self.__balance = opening_balance      # private: encapsulation
        self.__history = []
        if opening_balance > 0:
            self.__history.append(f"Opening deposit {opening_balance:.2f}")

    def deposit(self, amount):
        if amount <= 0:
            return "Deposit amount must be greater than zero."
        self.__balance += amount
        self.__history.append(f"Deposit    +{amount:.2f}")
        return f"Deposited {amount:.2f}. New balance: {self.__balance:.2f}"

    def withdraw(self, amount):
        if amount <= 0:
            return "Withdrawal amount must be greater than zero."
        if amount > self.__balance:
            return f"Insufficient balance. Available: {self.__balance:.2f}"
        self.__balance -= amount
        self.__history.append(f"Withdrawal -{amount:.2f}")
        return f"Withdrew {amount:.2f}. New balance: {self.__balance:.2f}"

    def get_balance(self):
        return self.__balance

    def get_history(self):
        return list(self.__history)           # copy, so the original stays safe


def bank_system():
    accounts = {}
    next_no = 1001

    def pick():
        try:
            no = int(input("Enter account number: "))
        except ValueError:
            print("Invalid account number.")
            return None
        if no not in accounts:
            print("Account not found.")
            return None
        return accounts[no]

    while True:
        print("\n1.Create  2.Deposit  3.Withdraw  4.Balance  5.History  6.Encapsulation demo  7.Back")
        ch = input("Enter choice: ")
        if ch == "1":
            name = input("Account holder name: ")
            opening = get_amount("Opening deposit: ")
            if opening is None or opening < 0:
                print("Account not created.")
                continue
            accounts[next_no] = BankAccount(next_no, name, opening)
            print(f"Account created. Account number: {next_no}")
            next_no += 1
        elif ch in ("2", "3"):
            acc = pick()
            if acc:
                amt = get_amount("Enter amount: ")
                if amt is not None:
                    print(acc.deposit(amt) if ch == "2" else acc.withdraw(amt))
        elif ch == "4":
            acc = pick()
            if acc:
                print(f"{acc.holder} | Balance: {acc.get_balance():.2f}")
        elif ch == "5":
            acc = pick()
            if acc:
                print(f"Transactions for {acc.holder}:")
                for t in acc.get_history():
                    print("  " + t)
        elif ch == "6":
            acc = next(iter(accounts.values()), None)
            if acc is None:
                print("Create an account first.")
            else:
                try:
                    print(acc.__balance)
                except AttributeError:
                    print("Direct access blocked: balance is private (use get_balance()).")
        elif ch == "7":
            break
        else:
            print("Invalid choice.")


# ----- Lab 15: Library Management System -----
class LibraryItem:                            # parent class
    loan_days = 14

    def __init__(self, item_id, title):
        self.item_id = item_id
        self.title = title
        self.available = True
        self.issued_to = None

    def issue(self, member):
        if not self.available:
            return f"'{self.title}' is already issued to {self.issued_to}."
        self.available = False
        self.issued_to = member
        return f"'{self.title}' issued to {member} for {self.loan_days} days."

    def give_back(self):
        if self.available:
            return f"'{self.title}' was not issued."
        who = self.issued_to
        self.available = True
        self.issued_to = None
        return f"'{self.title}' returned by {who}."

    def describe(self):
        return self.title


class Book(LibraryItem):                      # child class
    def __init__(self, item_id, title, author):
        super().__init__(item_id, title)
        self.author = author

    def describe(self):
        return f"Book: {self.title} by {self.author}"


class Magazine(LibraryItem):                  # child class, shorter loan period
    loan_days = 7

    def __init__(self, item_id, title, issue_name):
        super().__init__(item_id, title)
        self.issue_name = issue_name

    def describe(self):
        return f"Magazine: {self.title} ({self.issue_name})"


def library_system():
    items = {}
    next_id = 1

    while True:
        print("\n1.Add item  2.Display  3.Issue  4.Return  5.Back")
        ch = input("Enter choice: ")
        if ch == "1":
            kind = input("Book or Magazine (b/m): ").lower()
            title = input("Title: ")
            if kind == "b":
                items[next_id] = Book(next_id, title, input("Author: "))
            elif kind == "m":
                items[next_id] = Magazine(next_id, title, input("Issue (e.g. Nov 2026): "))
            else:
                print("Invalid type.")
                continue
            print(f"Added with ID {next_id}.")
            next_id += 1
        elif ch == "2":
            if not items:
                print("Library is empty.")
            for i, it in items.items():
                status = "Available" if it.available else f"Issued to {it.issued_to}"
                print(f"{i}. {it.describe():<42} [{status}]")
        elif ch in ("3", "4"):
            try:
                i = int(input("Enter item ID: "))
            except ValueError:
                print("Invalid ID.")
                continue
            if i not in items:
                print("Item not found.")
            elif ch == "3":
                print(items[i].issue(input("Member name: ")))
            else:
                print(items[i].give_back())
        elif ch == "5":
            break
        else:
            print("Invalid choice.")


# ----- Lab 16: Dice Simulator -----
def ways(n):
    """Number of ways to get each total with n dice (for expected probability)."""
    w = {0: 1}
    for _ in range(n):
        new = {}
        for total, c in w.items():
            for face in range(1, 7):
                new[total + face] = new.get(total + face, 0) + c
        w = new
    return w


def dice_simulator():
    seed = input("Seed for repeatable results (Enter for random): ")
    if seed.strip():
        random.seed(int(seed))

    while True:
        try:
            n = int(input("Number of dice (1-6): "))
            rolls = int(input("Number of rolls: "))
            if not 1 <= n <= 6 or rolls < 1:
                raise ValueError
        except ValueError:
            print("Invalid input. Dice must be 1-6 and rolls at least 1.")
            continue

        counts = {}
        for r in range(1, rolls + 1):
            faces = [random.randint(1, 6) for _ in range(n)]
            total = sum(faces)
            counts[total] = counts.get(total, 0) + 1
            if rolls <= 15:
                print(f"Roll {r:>2}: {' + '.join(map(str, faces))} = {total}")

        w = ways(n)
        peak = max(counts.values())
        print(f"\n{'Total':>5} {'Count':>6} {'Observed':>9} {'Expected':>9}  Bar")
        for total in range(n, 6 * n + 1):
            c = counts.get(total, 0)
            obs = c * 100 / rolls
            exp = w[total] * 100 / 6 ** n
            print(f"{total:>5} {c:>6} {obs:>8.1f}% {exp:>8.1f}%  {'#' * round(c * 25 / peak)}")

        if input("\nRun another simulation? (y/n): ").lower() != "y":
            break


# ----- Main Menu -----
while True:
    print("\n===== LAB EXPERIMENTS (UNIT 5) =====")
    print("1. Bank Account System")
    print("2. Library Management System")
    print("3. Dice Simulator")
    print("4. Exit")
    ch = input("Select experiment: ")
    if ch == "1":
        bank_system()
    elif ch == "2":
        library_system()
    elif ch == "3":
        dice_simulator()
    elif ch == "4":
        print("Goodbye!")
        break
    else:
        print("Invalid choice.")
