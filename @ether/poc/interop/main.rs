#[path = "out/add.rs"]
mod add;

use std::io::Read;

fn main() {
    let mut input = String::new();
    std::io::stdin().read_to_string(&mut input).unwrap();
    for line in input.lines() {
        let pair: Vec<i32> = line.split_whitespace().map(|n| n.parse().unwrap()).collect();
        match add::add(pair[0], pair[1]) {
            Some(sum) => println!("{}", sum),
            None => println!("out of domain"),
        }
    }
}
