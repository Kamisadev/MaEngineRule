fn kill_by_class(keyword) {
    remove() when @class == keyword
}
fn kill_by_id(keyword) {
    remove() when @id == keyword
}
fn kill_by_rel(keyword){
    remove() when @rel.contains(keyword)
}
