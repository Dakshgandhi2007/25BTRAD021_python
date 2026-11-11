# Lab Experiments (Unit 3) - Combined Program
# Lab 8: Contact Book | Lab 9: Student Grading | Lab 10: Frequency Counter
# Author: Daksh Gandhi | CSE-AIDE-A, JAIN (Deemed-to-be University)


# ---------------- Lab 8: Contact Book ----------------
def contact_book():
    contacts = []   # list of dictionaries

    def find(name):
        for c in contacts:
            if c["name"].lower() == name.lower():
                return c
        return None

    def add():
        name = input("Name: ")
        if find(name):
            print("Contact already exists.")
            return
        phone = input("Phone: ")
        email = input("Email: ")
        contacts.append({"name": name, "phone": phone, "email": email})
        print("Contact added.")

    def search():
        c = find(input("Enter name to search: "))
        if c:
            print(f"Found -> {c['name']} | {c['phone']} | {c['email']}")
        else:
            print("Contact not found.")

    def update():
        c = find(input("Enter name to update: "))
        if c:
            c["phone"] = input("New phone: ")
            c["email"] = input("New email: ")
            print("Contact updated.")
        else:
            print("Contact not found.")

    def delete():
        c = find(input("Enter name to delete: "))
        if c:
            contacts.remove(c)
            print("Contact deleted.")
        else:
            print("Contact not found.")

    def display():
        if not contacts:
            print("Contact book is empty.")
            return
        print(f"{'No.':<5}{'Name':<12}{'Phone':<14}{'Email'}")
        print("-" * 45)
        for i, c in enumerate(contacts, 1):
            print(f"{i:<5}{c['name']:<12}{c['phone']:<14}{c['email']}")

    while True:
        print("\n1.Add  2.Search  3.Update  4.Delete  5.Display  6.Back")
        choice = input("Enter choice: ")
        if choice == "1":
            add()
        elif choice == "2":
            search()
        elif choice == "3":
            update()
        elif choice == "4":
            delete()
        elif choice == "5":
            display()
        elif choice == "6":
            break
        else:
            print("Invalid choice.")


# ---------------- Lab 9: Student Grading System ----------------
def get_grade(m):
    if m >= 90:
        return "A+"
    elif m >= 80:
        return "A"
    elif m >= 70:
        return "B"
    elif m >= 60:
        return "C"
    elif m >= 50:
        return "D"
    else:
        return "F"


def grading_system():
    students = {}
    n = int(input("Enter number of students: "))
    for _ in range(n):
        name = input("Enter student name: ")
        marks = float(input(f"Enter marks of {name} (0-100): "))
        students[name] = marks

    print("\n" + "=" * 40)
    print(f"{'Name':<14}{'Marks':>8}{'Grade':>8}{'Result':>10}")
    print("=" * 40)
    for name, m in students.items():
        g = get_grade(m)
        result = "Fail" if g == "F" else "Pass"
        print(f"{name:<14}{m:>8.1f}{g:>8}{result:>10}")
    print("=" * 40)

    topper = max(students, key=students.get)
    avg = sum(students.values()) / len(students)
    passed = sum(1 for m in students.values() if m >= 50)
    print(f"Class average : {avg:.2f}")
    print(f"Topper        : {topper} ({students[topper]})")
    print(f"Pass count    : {passed}/{len(students)}")


# ---------------- Lab 10: Frequency Counter ----------------
def frequency_counter():
    words = input("Enter a sentence: ").lower().split()
    freq = {}
    for w in words:
        freq[w] = freq.get(w, 0) + 1

    print("\nWord frequency:")
    print(f"{'Word':<12}{'Count':>6}")
    print("-" * 18)
    for w, c in sorted(freq.items(), key=lambda x: x[1], reverse=True):
        print(f"{w:<12}{c:>6}")
    most = max(freq, key=freq.get)
    print(f"\nMost frequent word: '{most}' ({freq[most]} times)")

    responses = input("\nEnter survey responses separated by spaces: ").lower().split()
    count = {}
    for r in responses:
        count[r] = count.get(r, 0) + 1
    print("\nSurvey result:")
    for option, c in count.items():
        print(f"{option:<10}: {'#' * c} ({c})")
    print(f"Most preferred: {max(count, key=count.get)}")


# ---------------- Main Menu ----------------
while True:
    print("\n===== LAB EXPERIMENTS (UNIT 3) =====")
    print("1. Contact Book")
    print("2. Student Grading System")
    print("3. Frequency Counter")
    print("4. Exit")
    ch = input("Select experiment: ")
    if ch == "1":
        contact_book()
    elif ch == "2":
        grading_system()
    elif ch == "3":
        frequency_counter()
    elif ch == "4":
        print("Goodbye!")
        break
    else:
        print("Invalid choice.")
