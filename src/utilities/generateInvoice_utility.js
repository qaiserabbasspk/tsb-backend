const { sendInvoiceEmail } = require('../utilities/emailer_invoice');

const sendInvoice = async (invoiceData, tenant, propertyUnit, property, paymentPeriod, paymentOption, res) => {

    try {
        const formattedInvoiceDate = new Date(invoiceData.invoiceDate).toLocaleDateString('en-GB', {
            year: 'numeric', month: 'long', day: 'numeric'
        });
        
        const formattedDueDate = new Date(invoiceData.dueDate).toLocaleDateString('en-GB', {
            year: 'numeric', month: 'long', day: 'numeric'
        });

        // Email Body in HTML
        const emailBody = `Dear ${tenant.name}, <br><br>
        I hope this email finds you well.<br><br>
        Please find attached invoice <a href="https://admin.rentrack.org" target="_blank"><strong>${invoiceData.invoiceNumber}</strong></a> for your monthly rent. The total amount due is <strong>$.${invoiceData.totalAmount}</strong> and is due on <strong>${formattedDueDate}</strong><br><br>
        If you have any questions or require further information, please don't hesitate to contact us.<br><br>
        Thank you for doing business with us.<br><br>
        <h2 style="float: left;"><a href="https://rentrack.org" target="_blank">
        <img src="https://quickbooking.org/quickbooking-logo-wide.png" alt="QuickBooking Logo" style="width: 150px; height: auto;">
        </a></h2>     

            <div style="clear: both;"></div>
            <p><strong>Invoice:</strong> ${invoiceData.invoiceNumber}</p>
            <p><strong>Created:</strong> ${formattedInvoiceDate}</p>
            <p><strong>Due Date:</strong> ${formattedDueDate}</p>
            <hr><br>
            <table border="1" cellpadding="5" cellspacing="0" width="100%">
                <tr>
                    <th>Charge</th>
                    <th>Description</th>
                    <th>Amount</th>
                </tr>
                ${invoiceData.charges.map(charge => `
                <tr>
                    <td>${charge.name}</td>
                    <td>${charge.description}</td>
                    <td>$.${charge.amount}</td>
                </tr>
                `).join('')}
                <tr>
                    <td colspan="2"><strong>Total</strong></td>
                    <td><strong>$.${invoiceData.totalAmount}</strong></td>
                </tr>
            </table>

            <div style="display: flex; justify-content: space-between; margin-top: 20px;">
                <div>
                    <h3>Your Details</h3>
                    <p>Name: ${tenant.name} </p>
                    <p>Email: ${tenant.email}</p>
                    <p>Code: ${tenant.code}</p>
                <br>
                    <h3>Property</h3>
                    <p>Unit: ${propertyUnit.name} </p>
                    <p>Address: <br>
                    <p>${propertyUnit.address} </p>
                    </p>
                </div>
            </div>

            <h3>Payment Details</h3>
            <p>Period: ${paymentPeriod.name}</p>
            <p>Payment Option: ${paymentOption.name}</p>            
            <br><br>
            
            Best Regards <br>Rentrack Support<br><br>
            <a href="https://rentrack.org" target="_blank">
            <img src="https://quickbooking.org/quickbooking-logo-wide.png" alt="QuickBooking Logo" style="width: 150px; height: auto;">
            </a><br>
            &copy; ${new Date().getFullYear()} All rights reserved.`;

        const result = await sendInvoiceEmail(
            tenant.email,
            `Invoice ${invoiceData.invoiceNumber} Due`,
            emailBody,
            res,
        );

        console.log('Invoice email sent successfully:', result);
        // return res.status(200).json(result);

    } catch (error) {
        console.error('Error sending invoice email:', error.message);
        return res.status(500).json({ error: error.message });
    }
};

module.exports = { sendInvoice };
