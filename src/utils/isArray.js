export const isArray = (str) => {
  let arr;
  if (!Array.isArray(str)) {
    arr = [str]
    return arr;
  } else {
    return str;
  }
};