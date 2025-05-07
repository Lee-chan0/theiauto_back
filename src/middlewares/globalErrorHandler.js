const validationMessage = {
  articleTitle: '제목은 8글자 이상 100글자 이하로 해주세요.',
  articleSubTitle: '소제목은 8글자 이상 100글자 이하로 해주세요.',
  articleContent: '본문은 필수 항목입니다.',
  tagName: '태그는 필수 항목입니다.',
  categoryId: '카테고리를 선택해주세요.'
};

const validationArray = ['articleTitle', 'articleSubTitle', 'articleContent', 'tagName', 'categoryId'];

export const globalErrorHandler = (err, req, res, next) => {
  let validationMsg = "";

  console.log('전역 에러 미들웨어');
  console.log(err.name);
  console.log('에러메세지 : ', err.message);


  if (err.name === 'ValidationError') {
    validationArray.forEach((item) => {
      if (err.message.startsWith(`"${item}"`)) {
        validationMsg = item;
      }
    })
    return res.status(400).json({
      status: 'ValidationError',
      message: validationMessage[validationMsg],
    });
  }
  else if (err.name === 'TokenExpiredError') {
    return res.status(403).json({
      status: 'jwt expired',
      message: '세션이 만료되었습니다. 다시 로그인 해주세요.'
    })
  }

  res.status(err.status || 500).json({
    status: "error",
    message: err.message || "Server Error"
  });
}