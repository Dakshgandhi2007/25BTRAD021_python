# Mini Project (Unit 3): Attendance Tracker
# Uses a dictionary (student -> list of daily records), where each record is "P" or "A".
# Author: Daksh Gandhi | CSE-AIDE-A, JAIN (Deemed-to-be University)

attendance = {}      # {"Rahul": ["P", "A", "P"], ...}
total_days = 0       # number of classes held so far


def find(name):
    for s in attendance:
        if s.lower() == name.lower():
            return s
    return None


def add_student():
    name = input("Student name: ").strip()
    if not name:
        print("Name cannot be empty.")
    elif find(name):
        print("Student already exists.")
    else:
        # a student added late is marked absent for the days already held
        attendance[name] = ["A"] * total_days
        print(f"Student '{name}' added.")


def mark_today():
    global total_days
    if not attendance:
        print("No students yet. Add students first.")
        return
    total_days += 1
    print(f"\nMarking attendance for Day {total_days} (P = present, A = absent)")
    for name in attendance:
        while True:
            status = input(f"  {name}: ").strip().upper()
            if status in ("P", "A"):
                attendance[name].append(status)
                break
            print("  Enter only P or A.")


def update_record():
    name = find(input("Student name: "))
    if not name:
        print("Student not found.")
        return
    try:
        day = int(input(f"Day number (1-{total_days}): "))
    except ValueError:
        print("Invalid day number.")
        return
    if not 1 <= day <= total_days:
        print("Day out of range.")
        return
    status = input("New status (P/A): ").strip().upper()
    if status not in ("P", "A"):
        print("Invalid status.")
        return
    attendance[name][day - 1] = status
    print(f"{name}, Day {day} updated to {status}.")


def percentage(name):
    if total_days == 0:
        return 0.0
    return attendance[name].count("P") * 100 / total_days


def display():
    if not attendance:
        print("No records to show.")
        return
    header = f"{'Name':<10}" + "".join(f"D{d:<3}" for d in range(1, total_days + 1))
    print("\n" + header + f"{'Present':>8}{'%':>8}")
    print("-" * len(header + f"{'Present':>8}{'%':>8}"))
    for name, rec in attendance.items():
        row = f"{name:<10}" + "".join(f"{r:<4}" for r in rec)
        print(row + f"{rec.count('P'):>8}{percentage(name):>7.1f}%")
    print(f"Total classes held: {total_days}")


def below_threshold():
    try:
        limit = float(input("Enter threshold %: "))
    except ValueError:
        print("Invalid threshold.")
        return
    low = {n: percentage(n) for n in attendance if percentage(n) < limit}
    if not low:
        print(f"Everyone is at or above {limit:.0f}%.")
        return
    print(f"\nStudents below {limit:.0f}% (shortage):")
    for n, p in sorted(low.items(), key=lambda x: x[1]):
        print(f"  {n:<10}{p:>6.1f}%")


while True:
    print("\n===== ATTENDANCE TRACKER =====")
    print("1. Add student")
    print("2. Mark today's attendance")
    print("3. Update a record")
    print("4. Display attendance")
    print("5. Students below threshold")
    print("6. Exit")
    ch = input("Enter choice: ")
    if ch == "1":
        add_student()
    elif ch == "2":
        mark_today()
    elif ch == "3":
        update_record()
    elif ch == "4":
        display()
    elif ch == "5":
        below_threshold()
    elif ch == "6":
        print("Goodbye!")
        break
    else:
        print("Invalid choice.")
