const urls = [
    "https://www.techrum.vn/threads/r%C3%B2-r%E1%BB%89-thi%E1%BA%BFt-k%E1%BA%BF-m%E1%BB%9Bi-c%E1%BB%A7a-ios-27-nghe-c%C3%B3-v%E1%BA%BB-gi%E1%BB%91ng-nh%E1%BB%AFng-g%C3%AC-t%C3%B4i-mong-mu%E1%BB%91n-nh%E1%BA%A5t.899375/",
    "https://www.techrum.vn/threads/another-slug.123456",
    "https://www.techrum.vn/threads/.777777/"
];

urls.forEach(url => {
    const shortened = url.replace(/\/threads\/.*\.(\d+\/?)$/, "/threads/.$1");
    console.log(`Original: ${url}`);
    console.log(`Shortened: ${shortened}`);
    console.log('---');
});
