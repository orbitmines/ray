import argparse
import json
import pathlib
import random

OPERATORS = ["+", "-", "*"]
PRECEDENCE = {"+": 1, "-": 1, "*": 2}
NAMES = ["a", "b", "c", "d", "x", "y", "n", "m", "total", "rate"]
RAY_TYPE = {"int": "Int32", "long": "Int64"}


def tree(rng, parameters, depth):
    if depth == 0 or (depth < 3 and rng.random() < 0.3):
        return rng.choice(parameters) if rng.random() < 0.75 else str(rng.randint(1, 9))
    return (rng.choice(OPERATORS), tree(rng, parameters, depth - 1), tree(rng, parameters, depth - 1))


def needs_brackets(child, parent, right):
    if isinstance(child, str):
        return False
    if PRECEDENCE[child[0]] < PRECEDENCE[parent]:
        return True
    return right and PRECEDENCE[child[0]] == PRECEDENCE[parent]


def written(rng, node, space):
    if isinstance(node, str):
        text = node
    else:
        operator, left, right = node
        left_text = written(rng, left, space)
        right_text = written(rng, right, space)
        if needs_brackets(left, operator, False):
            left_text = "(" + left_text + ")"
        if needs_brackets(right, operator, True):
            right_text = "(" + right_text + ")"
        gap = " " if space() else ""
        text = left_text + gap + operator + gap + right_text
    return "(" + text + ")" if rng.random() < 0.1 else text


def normal(node, ray_type):
    if isinstance(node, str):
        return node
    operator, left, right = node
    return "((" + normal(left, ray_type) + " " + operator + " " + normal(right, ray_type) + ") as " + ray_type + ")"


def mutated(node):
    if isinstance(node, str):
        return None
    operator, left, right = node
    return ({"+": "-", "-": "+", "*": "+"}[operator], left, right)


def c_source(rng, name, c_type, parameters, body, space):
    listed = ("," + (" " if space() else "")).join(c_type + " " + p for p in parameters)
    head = c_type + " " + name + "(" + listed + ")"
    if rng.random() < 0.5:
        return head + " { return " + body + "; }\n"
    return head + "\n{\n    return " + body + ";\n}\n"


def python_source(rng, name, parameters, body, space):
    annotated = rng.random() < 0.5
    listed = ("," + (" " if space() else "")).join(p + (": int" if annotated else "") for p in parameters)
    head = "def " + name + "(" + listed + ")" + (" -> int" if annotated else "") + ":"
    return head + (" return " + body + "\n" if rng.random() < 0.3 else "\n    return " + body + "\n")


def ray_number(value):
    return str(value) if value > 0 else "(1 - " + str(1 - value) + ")"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--count", type=int, default=40)
    parser.add_argument("--seed", type=int, default=1)
    parser.add_argument("--inputs", type=int, default=3)
    parser.add_argument("--mutate", type=int, default=0)
    parser.add_argument("--out", required=True)
    arguments = parser.parse_args()
    rng = random.Random(arguments.seed)
    out = pathlib.Path(arguments.out)
    out.mkdir(parents=True, exist_ok=True)
    claims = ["mark ^keyword := global", ""]
    writes = []
    corpus = []
    for index in range(1, arguments.count + 1):
        name = "f" + str(index)
        parameters = rng.sample(NAMES, rng.randint(1, 4))
        c_type = rng.choice(["int", "long"])
        body = tree(rng, parameters, 3)
        space = lambda: rng.random() < 0.6
        python_body = mutated(body) if index == arguments.mutate and mutated(body) else body
        (out / (name + ".c")).write_text(c_source(rng, name, c_type, parameters, written(rng, body, space), space))
        python_text = python_source(rng, name, parameters, written(rng, python_body, space), space)
        (out / (name + ".py")).write_text(python_text)
        namespace = {}
        exec(python_text, namespace)
        signature = ", ".join(p + ": " + RAY_TYPE[c_type] for p in parameters)
        (out / (name + ".ray")).write_text(name + " (" + signature + ") => " + normal(body, RAY_TYPE[c_type]) + "\n")
        c_file, py_file, ray_file = "out/corpus/" + name + ".c", "out/corpus/" + name + ".py", "out/corpus/" + name + ".ray"
        claims.append("from_c_" + name + " := c_ray(text_of_file \"" + c_file + "\")")
        claims.append("from_python_" + name + " := p_ray_with((text_of_file \"" + py_file + "\"), \"" + RAY_TYPE[c_type] + "\")")
        claims.append("unless from_c_" + name + " == from_python_" + name + " { INFO@mark `N3." + str(index) + ".a " + name + " read from C and from Python differ` }")
        claims.append("unless from_c_" + name + " == (text_of_file \"" + ray_file + "\") { INFO@mark `N3." + str(index) + ".b " + name + " read from C is not its normal form` }")
        writes.append("rust_" + name + " := rust_function(c_ray(text_of_file \"" + c_file + "\"))")
        writes.append("rust_" + name + " written_to_file \"out/corpus/" + name + ".rs\"")
        corpus.append({"name": name, "type": c_type, "parameters": parameters, "tree": body, "python_tree": python_body})
        claims.append("exact_" + name + " := p_ray_with((text_of_file \"" + py_file + "\"), \"Integer\")")
        claims.append("ray_code exact_" + name)
        for run in range(arguments.inputs):
            values = {p: rng.randint(-50, 50) for p in parameters}
            expected = namespace[name](*[values[p] for p in parameters])
            call = name + "(" + ", ".join(ray_number(values[p]) for p in parameters) + ")"
            claims.append("unless (" + call + ") == " + ray_number(expected) + " { INFO@mark `N3." + str(index) + ".c" + str(run + 1) + " " + call + " is not what python3 computes` }")
    (out / "claims.ray").write_text("\n".join(claims) + "\n")
    (out / "writes.ray").write_text("\n".join(writes) + "\n")
    (out / "corpus.json").write_text(json.dumps(corpus))


main()
