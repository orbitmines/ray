import argparse
import json
import pathlib
import random
import subprocess

BOUNDS = {"int": (-2**31, 2**31 - 1), "long": (-2**63, 2**63 - 1)}
EDGES = {
    "int": [-2**31, -2**31 + 1, 2**31 - 1, 2**31 - 2, -1, 1, 2, 3, 65536, -65536, 46341, -46341],
    "long": [-2**63, -2**63 + 1, 2**63 - 1, 2**63 - 2, -1, 1, 2, 3, 2**32, -2**32, 3037000500, -3037000500],
}


def exact(node, values, low, high):
    if isinstance(node, str):
        return (values[node] if node in values else int(node)), False
    operator, left, right = node
    a, left_out = exact(left, values, low, high)
    b, right_out = exact(right, values, low, high)
    result = a + b if operator == "+" else a - b if operator == "-" else a * b
    return result, left_out or right_out or not low <= result <= high


def inputs_for(rng, function, count):
    low, high = BOUNDS[function["type"]]
    edges = EDGES[function["type"]]
    chosen = []
    for _ in range(count):
        chosen.append([rng.choice(edges) if rng.random() < 0.5 else rng.randint(low, high) if rng.random() < 0.3 else rng.randint(-1000, 1000) for _ in function["parameters"]])
    return chosen


def rust_program(corpus, folder):
    arms = []
    for function in corpus:
        arguments = ", ".join("p[" + str(i + 1) + "].parse().unwrap()" for i in range(len(function["parameters"])))
        arms.append('            "' + function["name"] + '" => ' + function["name"] + "(" + arguments + ").map(|v| v as i128),")
    sources = [(folder / (f["name"] + ".rs")).read_text() for f in corpus]
    main = [
        "use std::io::Read;",
        "fn main() {",
        "    let mut input = String::new();",
        "    std::io::stdin().read_to_string(&mut input).unwrap();",
        "    for line in input.lines() {",
        "        let p: Vec<&str> = line.split_whitespace().collect();",
        "        let answer: Option<i128> = match p[0] {",
        *arms,
        "            _ => None,",
        "        };",
        '        match answer { Some(v) => println!("{}", v), None => println!("none") }',
        "    }",
        "}",
    ]
    return "".join(sources) + "\n".join(main) + "\n"


def c_program(corpus, folder):
    calls = []
    for function in corpus:
        arguments = ", ".join("(" + function["type"] + ") a[" + str(i) + "]" for i in range(len(function["parameters"])))
        calls.append('        if (strcmp(name, "' + function["name"] + '") == 0) printf("%lld\\n", (long long) ' + function["name"] + "(" + arguments + "));")
    sources = [(folder / (f["name"] + ".c")).read_text() for f in corpus]
    main = [
        "#include <stdio.h>",
        "#include <string.h>",
        "int main(void) {",
        "    char name[64];",
        "    long long a[4];",
        "    char line[512];",
        "    while (fgets(line, sizeof line, stdin)) {",
        '        int n = sscanf(line, "%63s %lld %lld %lld %lld", name, &a[0], &a[1], &a[2], &a[3]);',
        "        if (n < 1) continue;",
        *calls,
        "    }",
        "    return 0;",
        "}",
    ]
    return "\n".join(main[:2]) + "\n" + "".join(sources) + "\n".join(main[2:]) + "\n"


def run(binary, lines):
    return subprocess.run([str(binary)], input="\n".join(lines) + "\n", capture_output=True, text=True, check=True).stdout.split("\n")[:-1]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--corpus", required=True)
    parser.add_argument("--inputs", type=int, default=30)
    parser.add_argument("--seed", type=int, default=1)
    arguments = parser.parse_args()
    folder = pathlib.Path(arguments.corpus)
    corpus = json.loads((folder / "corpus.json").read_text())
    missing = [f["name"] for f in corpus if not (folder / (f["name"] + ".rs")).exists()]
    if missing:
        print("N4 Ray wrote no Rust for:", " ".join(missing))
        raise SystemExit(1)
    (folder / "all.rs").write_text(rust_program(corpus, folder))
    (folder / "all.c").write_text(c_program(corpus, folder))
    subprocess.run(["rustc", "--edition", "2021", "-A", "warnings", "-O", str(folder / "all.rs"), "-o", str(folder / "all-rs")], check=True)
    subprocess.run(["gcc", "-O0", "-w", str(folder / "all.c"), "-o", str(folder / "all-c")], check=True)
    rng = random.Random(arguments.seed + 2000)
    lines, cases = [], []
    for function in corpus:
        for values in inputs_for(rng, function, arguments.inputs):
            lines.append(function["name"] + " " + " ".join(str(v) for v in values))
            cases.append((function, values))
    rust, c = run(folder / "all-rs", lines), run(folder / "all-c", lines)
    answered, refused, wrong = 0, 0, []
    for (function, values), r, g in zip(cases, rust, c):
        low, high = BOUNDS[function["type"]]
        value, overflowed = exact(function["tree"], dict(zip(function["parameters"], values)), low, high)
        if r == "none":
            if overflowed:
                refused += 1
            else:
                wrong.append((function["name"], values, "Rust refused, no intermediate leaves the type", value, g))
        elif overflowed:
            wrong.append((function["name"], values, "Rust answered though an intermediate leaves the type", r, g))
        elif int(r) == value == int(g):
            answered += 1
        else:
            wrong.append((function["name"], values, "Rust, exact and gcc differ", r + " / " + str(value), g))
    for case in wrong[:20]:
        print("WRONG", *case)
    print("N4", len(corpus), "functions,", len(cases), "inputs:", answered, "answered and equal to gcc and exact,", refused, "refused where an intermediate leaves the type,", len(wrong), "wrong")
    raise SystemExit(1 if wrong else 0)


main()
