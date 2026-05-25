const { chromium } = require('playwright');

// ==========================================
// 配置你需要填写的表单信息
// ==========================================
const userInfo = {
    // ---- page 1 选项 ----
    idType: "中國居民身份證",       // 证件种类，例如 "HKID" (香港身份证)
    accountType: "一般賬戶",     // 账户种类，例如 "N" (跨境理財通:北向通匯款專戶)
    
    // ---- page 2 选项 ----
    title: "1",           // 称呼 (单选框选项值: 1=先生, 2=小姐, 3=太太, 4=女士)
    surname: "CHAN",      // 姓氏
    firstName: "TAI MAN", // 名字
    countryNo: "86 中國內地",      // 区号
    telNo: "13800138000", // 手机号码
    email: "example@example.com", // 邮箱
    
    precondition: "B",    // 办理条件依据 (单选框选项值: "B", "D" 等)
    
    district: "中西區",       // 区域
    branchCode: "中區分行", // 分行代码
    appDate: "2026-06-01",// 预约日期 (格式需与日历控件一致，如 2026-06-01)
    appTime: "09:00"      // 预约时间
};

(async () => {
    console.log("🚀 启动浏览器...");
    // headless: false 表示开启有界面模式，方便你观察它的操作。准备好后可以改成 true 来后台静默运行
    const browser = await chromium.launch({ headless: false, slowMo: 100 });
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
        // ==========================================
        // 第一步：访问首页，选择证件类型与账户种类
        // ==========================================
        const startUrl = 'https://transaction.bochk.com/whk/form/openAccount/input.action?lang=zh_HK'; // 请替换为第一步的实际线上真实URL
        console.log(`🌐 正在访问页面: ${startUrl}`);
        await page.goto(startUrl, { waitUntil: 'load' });

        // 等待选择框出现并选择证件类型和账户类型
        const idTypeSelector = 'select[name="bean.idType"]';
        const accountTypeSelector = 'select[name="bean.serviceAccountType"]';
        
        await page.waitForSelector(idTypeSelector, { timeout: 10000 });
        
        console.log(`✅ 正在选择证件种类 [${userInfo.idType}] 及账户种类 [${userInfo.accountType}]...`);
        await page.selectOption(idTypeSelector, userInfo.idType);
        await page.selectOption(accountTypeSelector, userInfo.accountType);

        // 选择完毕后可能会触发界面的重新渲染或显示协议等操作
        await page.waitForTimeout(500);

        // 勾选用户协议复选框
        const acceptTermsSelector = '#mortgageLoans_form_acceptTerms_field';
        await page.waitForSelector(acceptTermsSelector, { timeout: 5000 });
        console.log("✅ 正在勾选协议并进入下一步...");
        await page.check(acceptTermsSelector);
        
        // 点击继续按钮，触发跳转
        await page.click('#eAAOForm_submit_button');

        // ==========================================
        // 第二步：填写表单与验证码
        // ==========================================
        console.log("⏳ 等待资料填写页面加载...");
        // 通过等待一个必须的输入框出现来确认第二页已加载
        await page.waitForSelector('input[name="bean.surname"]');

        console.log("✍️ 正在填写基本信息...");
        
        // title 是一个单选框 (radio)
        await page.check(`input[name="bean.title"][value="${userInfo.title}"]`);

        // 填写普通输入框
        await page.fill('input[name="bean.surname"]', userInfo.surname);
        await page.fill('input[name="bean.firstName"]', userInfo.firstName);
        
        // countryNo 可能是定制的隐藏或浮层输入框，强制使用 evaluate 赋值并触发事件
        await page.evaluate((countryCode) => {
            const countryEl = document.querySelector('input[name="bean.countryNo"]');
            if (countryEl) {
                countryEl.value = countryCode;
                countryEl.dispatchEvent(new Event('change', { bubbles: true }));
                
                // 将可能用于显示的定制 label 同步更新（根据页面原有逻辑常见特征）
                const locationLabel = document.querySelector('.searchContainer .locationLabel');
                if(locationLabel) locationLabel.innerText = '+' + countryCode;
            }
        }, userInfo.countryNo);

        await page.fill('input[name="bean.telNo"]', userInfo.telNo);
        await page.fill('input[name="bean.email"]', userInfo.email);

        // precondition 也是一个单选框 (radio)
        // 使用 try-catch 忽略可能的未找到（具体看页面是否需要这个字段，不一定所有流程都有）
        try { await page.check(`input[name="bean.precondition"][value="${userInfo.precondition}"]`); } catch(e){}

        // appDate 是只读 (readonly) 的日历输入框，正常的 fill() 可能会报错，所以使用 evaluate 直接赋值
        await page.evaluate((dateVal) => {
            const dateEl = document.getElementById('eAAOForm_appDate_field');
            if(dateEl) {
                dateEl.value = dateVal;
                // 触发其绑定的 onchange 事件（源文件中有 changeAppDate）
                if (typeof window.changeAppDate === 'function') {
                    window.changeAppDate(dateVal);
                } else {
                    dateEl.dispatchEvent(new Event('change', { bubbles: true }));
                }
            }
        }, userInfo.appDate);

        // 处理分行区域 (动态寻找第一个未满且没被禁用的区域并选择)
        console.log("⏳ 正在寻找未满的分行区域...");
        const availableDistrict = await page.evaluate(() => {
            const options = Array.from(document.querySelectorAll('select[name="bean.district"] option'));
            // 排除值为空(请选择)以及被禁用/带有已满字样的选项
            const validOpt = options.find(o => o.value && !o.disabled && !o.text.includes('已滿') && !o.text.includes('已满'));
            return validOpt ? validOpt.value : null;
        });

        if (availableDistrict) {
            console.log(`✅ 找到可用区域并选择: [${availableDistrict}]`);
            await page.selectOption('select[name="bean.district"]', availableDistrict);
        } else {
            console.error("❌ 警告：所有区域均已满！强行使用配置默认值测试...");
            try { await page.selectOption('select[name="bean.district"]', userInfo.district); } catch (e) {}
        }
        
        // 区域改变可能会触发 ajax 请求分行列表，延时等待一下即可
        console.log("⏳ 等待分行数据加载(AJAX)...");
        await page.waitForTimeout(1500); 

        // 同样动态处理[具体分行]选项
        console.log("⏳ 正在寻找未满的具体分行...");
        const availableBranch = await page.evaluate(() => {
            const options = Array.from(document.querySelectorAll('select[name="bean.branchCode"] option'));
            const validOpt = options.find(o => o.value && !o.disabled && !o.text.includes('已滿') && !o.text.includes('已满'));
            return validOpt ? validOpt.value : null;
        });

        if (availableBranch) {
            console.log(`✅ 找到可用分行并选择: [${availableBranch}]`);
            await page.selectOption('select[name="bean.branchCode"]', availableBranch);
        } else {
            console.error("❌ 警告：当前区域下的所有分行可能已满！");
            try { await page.selectOption('select[name="bean.branchCode"]', userInfo.branchCode); } catch (e) {}
        }

        await page.selectOption('select[name="bean.appTime"]', userInfo.appTime);

        // ==========================================
        // 第三步：抓取验证码并请求本地 OCR 服务
        // ==========================================
        console.log("🔍 正在识别验证码...");
        const captchaSelector = '#captcha_img';
        const captchaLocator = page.locator(captchaSelector);
        
        // Playwright 神技：直接对着 DOM 元素截图并返回 Buffer
        const captchaBuffer = await captchaLocator.screenshot();
        const base64Image = captchaBuffer.toString('base64');

        // 发起请求到本地基于 Docker 跑起来的 FastApi
        const response = await fetch("http://127.0.0.1:8080/api/recognize", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ image_base64: base64Image })
        });
        
        const resData = await response.json();

        if (resData.code === 200 && resData.result) {
            console.log(`🎯 验证码识别成功: [${resData.result}]`);
            // 填入验证码
            await page.fill('input[name="captcha"]', resData.result);
            
            // ==========================================
            // 提交表单 (建议测试时保留注释，跑通后再开启自动提交)
            // ==========================================
            // console.log("🚀 所有资料填写完毕，提交表单...");
            // await page.click('#eAAOForm_submit_button'); 
            
            console.log("🎉 流程执行完毕，保留浏览器供排查检查 30 秒...");
            await page.waitForTimeout(30000); // 停留30秒供肉眼确认，结束后自动关闭
        } else {
            console.error("❌ 验证码识别失败，返回数据:", resData);
        }

    } catch (error) {
        console.error("💥 脚本执行过程中发生错误:", error);
    } finally {
        console.log("清理并关闭浏览器...");
        await browser.close();
    }
})();