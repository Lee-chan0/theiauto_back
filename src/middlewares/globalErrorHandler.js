export const globalErrorHandler = (err, req, res, next) => {
  console.error(err.stack); // 에러가 어디에서 발생했는지 콜스택을 로그로 찍어줌

  res.status(err.status || 500).json({ // 에러 객체에 status가 있으면 그것을 사용하고, 없으면 500코드를 반환함
    status: "error", // JSON형식으로 알려주는데 status : "error"는 에러라는것을 알려주는것이고
    message: err.message || "Server Error" // err객체에 message가 있으면 그것을 출력. 없으면 "Server Error"출력
  });
}