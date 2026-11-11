# Lab Experiments (Unit 4) - Combined Program
# Lab 11: Log File Reader | Lab 12: Student Data Manager | Lab 13: CSV Payroll
# Author: Daksh Gandhi | CSE-AIDE-A, JAIN (Deemed-to-be University)
import csv
import os


# ----- Lab 11: Log File Reader -----
def make_sample_log():
    """Create a sample application log if it doesn't exist."""
    if os.path.exists("app.log"):
        return
    lines = [
        "2026-11-10 09:00:01 INFO Application started",
        "2026-11-10 09:00:05 INFO User login successful: rahul",
        "2026-11-10 09:01:12 WARNING Disk usage at 85%",
        "2026-11-10 09:02:40 ERROR Database connection failed",
        "2026-11-10 09:02:45 INFO Retrying connection",
        "2026-11-10 09:03:10 ERROR Timeout while calling payment API",
        "2026-11-10 09:04:00 WARNING Slow response time: 4.2s",
        "2026-11-10 09:05:30 INFO Connection restored",
        "2026-11-10 09:06:00 INFO User logout: rahul",
        "2026-11-10 09:07:15 ERROR Null value in order table",
    ]
    with open("app.log", "w") as f:
        f.write("\n".join(lines) + "\n")


def log_reader():
    make_sample_log()
    filename = input("Enter log file name: ")
    counts = {"ERROR": 0, "WARNING": 0, "INFO": 0}
    errors = []
    try:
        with open(filename, "r") as f:
            lines = f.readlines()
    except FileNotFoundError:
        print(f"Error: file '{filename}' not found.")
        return

    if len(lines) == 0:
        print("The log file is empty.")
        return

    for line in lines:
        for key in counts:
            if key in line.split():          # match whole word only
                counts[key] += 1
                if key == "ERROR":
                    errors.append(line.strip())

    total = sum(counts.values())
    print(f"\nTotal lines read : {len(lines)}")
    print("-" * 28)
    for key, c in counts.items():
        print(f"{key:<10}: {c}")
    print("-" * 28)
    print(f"Categorised: {total} | Other: {len(lines) - total}")
    if errors:
        print("\nError lines:")
        for e in errors:
            print("  " + e)


# ----- Lab 12: Student Data Manager -----
STUDENT_FILE = "students.txt"   # each line: roll,name,branch,cgpa


def load_students():
    students = []
    if not os.path.exists(STUDENT_FILE):
        return students
    with open(STUDENT_FILE, "r") as f:
        for line in f:
            line = line.strip()
            if line:
                roll, name, branch, cgpa = line.split(",")
                students.append([roll, name, branch, cgpa])
    return students


def save_students(students):
    with open(STUDENT_FILE, "w") as f:
        for s in students:
            f.write(",".join(s) + "\n")


def valid_cgpa(text):
    try:
        v = float(text)
    except ValueError:
        return False
    return 0 <= v <= 10


def student_manager():
    while True:
        print("\n1.Add  2.Search  3.Update CGPA  4.Display  5.Back")
        ch = input("Enter choice: ")
        students = load_students()

        if ch == "1":
            roll = input("Roll no: ")
            if not roll.isdigit():
                print("Invalid roll number (digits only).")
                continue
            if any(s[0] == roll for s in students):
                print("Roll number already exists.")
                continue
            name = input("Name: ")
            branch = input("Branch: ")
            cgpa = input("CGPA (0-10): ")
            if not valid_cgpa(cgpa):
                print("Invalid CGPA. Record not saved.")
                continue
            with open(STUDENT_FILE, "a") as f:       # append mode
                f.write(f"{roll},{name},{branch},{cgpa}\n")
            print("Record added.")

        elif ch == "2":
            roll = input("Enter roll no to search: ")
            found = [s for s in students if s[0] == roll]
            if found:
                s = found[0]
                print(f"Found -> {s[0]} | {s[1]} | {s[2]} | CGPA {s[3]}")
            else:
                print("Student not found.")

        elif ch == "3":
            roll = input("Enter roll no to update: ")
            for s in students:
                if s[0] == roll:
                    new = input("New CGPA (0-10): ")
                    if valid_cgpa(new):
                        s[3] = new
                        save_students(students)
                        print("Record updated.")
                    else:
                        print("Invalid CGPA. No change made.")
                    break
            else:
                print("Student not found.")

        elif ch == "4":
            if not students:
                print("No records found.")
            else:
                print(f"{'Roll':<8}{'Name':<12}{'Branch':<10}{'CGPA'}")
                print("-" * 38)
                for s in students:
                    print(f"{s[0]:<8}{s[1]:<12}{s[2]:<10}{s[3]}")

        elif ch == "5":
            break
        else:
            print("Invalid choice.")


# ----- Lab 13: CSV Payroll Management -----
HRA_RATE = 0.20     # house rent allowance on basic
DA_RATE = 0.10      # dearness allowance on basic
PF_RATE = 0.12      # provident fund on basic
PROF_TAX = 200      # flat professional tax
TAX_LIMIT = 50000   # income tax applies if gross exceeds this
TAX_RATE = 0.05


def make_sample_csv():
    if os.path.exists("employees.csv"):
        return
    rows = [
        ["emp_id", "name", "department", "basic"],
        ["E101", "Rahul", "Sales", "30000"],
        ["E102", "Priya", "IT", "45000"],
        ["E103", "Amit", "HR", "25000"],
        ["E104", "Neha", "IT", "60000"],
        ["E105", "Karan", "Sales", "abc"],      # bad data on purpose
    ]
    with open("employees.csv", "w", newline="") as f:
        csv.writer(f).writerows(rows)


def payroll():
    make_sample_csv()
    filename = input("Enter CSV file name: ")
    try:
        f = open(filename, "r", newline="")
    except FileNotFoundError:
        print(f"Error: file '{filename}' not found.")
        return

    total_gross = total_ded = total_net = 0
    count = 0
    skipped = []
    print(f"\n{'ID':<7}{'Name':<9}{'Dept':<7}{'Gross':>10}{'Deduct':>10}{'Net':>10}")
    print("-" * 53)
    with f:
        for row in csv.DictReader(f):
            try:
                basic = float(row["basic"])
                if basic <= 0:
                    raise ValueError
            except ValueError:
                skipped.append(row["emp_id"])
                continue
            gross = basic + basic * HRA_RATE + basic * DA_RATE
            ded = basic * PF_RATE + PROF_TAX
            if gross > TAX_LIMIT:
                ded += gross * TAX_RATE
            net = gross - ded
            print(f"{row['emp_id']:<7}{row['name']:<9}{row['department']:<7}"
                  f"{gross:>10.2f}{ded:>10.2f}{net:>10.2f}")
            total_gross += gross
            total_ded += ded
            total_net += net
            count += 1

    print("-" * 53)
    if count == 0:
        print("No valid employee records found.")
        return
    print(f"Employees paid   : {count}")
    print(f"Total gross      : {total_gross:.2f}")
    print(f"Total deductions : {total_ded:.2f}")
    print(f"Total net payout : {total_net:.2f}")
    print(f"Average net pay  : {total_net / count:.2f}")
    if skipped:
        print(f"Skipped (invalid data): {', '.join(skipped)}")


# ----- Main Menu -----
while True:
    print("\n===== LAB EXPERIMENTS (UNIT 4) =====")
    print("1. Log File Reader")
    print("2. Student Data Manager")
    print("3. CSV Payroll System")
    print("4. Exit")
    ch = input("Select experiment: ")
    if ch == "1":
        log_reader()
    elif ch == "2":
        student_manager()
    elif ch == "3":
        payroll()
    elif ch == "4":
        print("Goodbye!")
        break
    else:
        print("Invalid choice.")
