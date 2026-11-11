const mongoose = require('mongoose');
const DateUtil = require("./date_utility");
const { createActivityLog } = require("./activitylog_utility");
const Response = require("../utilities/response_utility");
const TenantScreening = require("../models/tenantScreening");

const createScreening = async (Model, application, tenant, owner, moduleName, actionBy) => {
    try {
        // console.log(`Creating TenantScreening ${moduleName}...`);
        const screening = new Model({
            code: application.code,// Use the same code passed from the Application
            applicationId: application._id,
            tenantId: application.tenantId,
            propertyId: application.propertyId,
            propertyUnitId: application.propertyUnitId,
            personalInformation: {
                tenantName: tenant.name,
                phone: {
                    code: tenant.phone.code,
                    number: tenant.phone.number,
                },
                address: {
                    city: tenant.address.city,
                    state: tenant.address.state,
                    zipcode: tenant.address.zipcode,
                },
            },
            emergencyContact: {
                emergencyName: null,
                phone: {
                    code: null,
                    number: null,
                },
                address: {
                    city: null,
                    state: null,
                    zipcode: null,
                },
            },
            currentAddress: {
                propertyAddress: null,
                unit: null,
                city: null,
                state: null,
                zipcode: null,
                moveInDate: null,
                moveOutDate: null,
                QA: {
                    question: null,
                    answer: null,
                },
                monthlyRent: {
                    currency: null,
                    amount: null,
                },
                landLord: {
                    name: null,
                    email: null,
                    phone: {
                        code: null,
                        number: null,
                    },
                },
                reasonForLeaving: null,
            },
            references: [
                {
                    referenceName: null,
                    phone: {
                        code: null,
                        number: null,
                    }
                },
            ],
            identityVerification:
            {
                SSNorTIN: null,
                drivingLicense: null,
                state: null,
            },
            bankInformation: {
                bankName: null,
                bankBalance: null,
                bank2Name: null,
                bank2Balance: null,
            },
            currentEmployment: {
                QA: {
                    question: null,
                    answer: null,
                },
                occupation: null,
                companyName: null,
                companyAddress: null,
                city: null,
                state: null,
                zipcode: null,
                supervisorName: null,
                supervisorPhone: {
                    code: null,
                    number: null,
                },
                jobStartDate: null,
                annualSalary: null,
            },
            previousEmployment: {
                QA: {
                    question: null,
                    answer: null,
                },
                occupation: null,
                companyName: null,
                companyAddress: null,
                city: null,
                state: null,
                zipcode: null,
                supervisorName: null,
                supervisorPhone: {
                    code: null,
                    number: null,
                },
                jobStartDate: null,
                jobEndDate: null,
                annualSalary: null,
            },
            educationInformation:
            {
                schoolLastAttended: null,
                startDate: null,
                endDate: null,
                degree: null,
            },
            guarantorInformation: {
                QA: [
                    {
                        question: null,
                        answer: null,
                        _id: false
                    }
                ],
                homeAddress: null,
                unit: null,
                city: null,
                state: null,
                zipcode: null,
                occupation: null,
                companyName: null,
                companyAddress: null,
                moveInDate: null,
                monthlyRent: null,
                jobStartDate: null,
                annualSalary: null,
                checkingAccountBankName: null,
                checkingAccountNumber: null,
                savingAccountBankName: null,
                savingAccountNumber: null,
                SSNorTIN: null,
                drivingLicense: null,
                state: null,
            },
            additionalInformation:
            {
                QA: [
                    {
                        question: null,
                        answer: null,
                        description: null,
                        _id: false
                    }
                ],
            },
            occupants: {
                totalOccupantsIncludingYou: null,
            },
            vehicleInformation: {
                QA: {
                    question: null,
                    answer: null,
                },
                vehicle1LicensePlate: null,
                vehicle1MakeAndModel: null,
                vehicle1ModelYear: null,
                vehicle1State: null,
                vehicle2LicensePlate: null,
                vehicle2MakeAndModel: null,
                vehicle2ModelYear: null,
                vehicle2State: null,
            },
            documents: application.documents,
            screeningStatus: 0,
            ownerCode: owner.code,
            reason: null,
            createdOn: DateUtil.currentDate(),
        });

        await screening.save()
            .then(() => console.log("TenantScreening saved successfully"))
            .catch(err => {
                // console.error("Save Error:", err);
                throw new Error("Database save error: " + err.message);
            });

        // Log the action  
        const action = `New ${moduleName} Screening`;
        const person = actionBy == '' || actionBy == null ? tenant.code : actionBy;
        await createActivityLog("Screening", action, person);
    } catch (err) {
        // console.error(`Error creating ${roleName}:`, err.message);
        throw err; // Propagate error for global handling
    }
}

const updateScreening = async (uniqueDocuments, application, tenant, owner, modulename, actionBy, body, res) => {
    try {
        // console.log(`documents ${uniqueDocuments}`);
        // console.log(`applicationID ${body.id}`);
        // console.log(`${JSON.stringify(body)}`);

        if (!mongoose.Types.ObjectId.isValid(body.id)) {
            console.error(`Invalid applicationId format:`, body.id);
            return res.status(400).json({ message: `Invalid applicationId format` });
        }

        const updateData = {
            // code: application.code,
            // tenantId: application.tenantId,
            // propertyId: application.propertyId,
            // propertyUnitId: application.propertyUnitId,
            // personalInformation: {
            //     tenantName: tenant.name,
            //     phone: {
            //         code: tenant.phone.code,
            //         number: tenant.phone.number,
            //     },
            //     address: {
            //         city: tenant.address.city,
            //         state: tenant.address.state,
            //         zipcode: tenant.address.zipcode,
            //     },
            // },
            screeningStatus: 1,
            emergencyContact: {
                emergencyName: body.emergencyContact?.emergencyName,
                phone: {
                    code: body.emergencyContact?.phone?.code,
                    number: body.emergencyContact?.phone?.number,
                },
                address: {
                    city: body.emergencyContact?.address?.city,
                    state: body.emergencyContact?.address?.state,
                    zipcode: body.emergencyContact?.address?.zipcode,
                },
            },
            currentAddress: {
                propertyAddress: body.currentAddress?.propertyAddress,
                unit: body.currentAddress?.unit,
                city: body.currentAddress?.city,
                state: body.currentAddress?.state,
                zipcode: body.currentAddress?.zipcode,
                moveInDate: body.currentAddress?.moveInDate,
                moveOutDate: body.currentAddress?.moveOutDate,
                QA: {
                    question: body.currentAddress?.QA?.question,
                    answer: body.currentAddress?.QA?.answer,
                },
                monthlyRent: {
                    currency: body.currentAddress?.monthlyRent?.currency,
                    amount: body.currentAddress?.monthlyRent?.amount,
                },
                landLord: {
                    name: body.currentAddress?.landLord?.name,
                    email: body.currentAddress?.landLord?.email,
                    phone: {
                        code: body.currentAddress?.landLord?.phone?.code,
                        number: body.currentAddress?.landLord?.phone?.number,
                    },
                },
                reasonForLeaving: body.currentAddress?.reasonForLeaving,
            },
            references: body.references?.map(ref => ({
                referenceName: ref.referenceName,
                phone: {
                    code: ref.phone?.code,
                    number: ref.phone?.number,
                },
            })) || [],
            identityVerification: {
                SSNorTIN: body.identityVerification?.SSNorTIN,
                drivingLicense: body.identityVerification?.drivingLicense,
                drivingLicenseState: body.identityVerification?.drivingLicenseState,
            },
            bankInformation: {
                bankName: body.bankInformation?.bankName,
                bankBalance: body.bankInformation?.bankBalance,
                bank2Name: body.bankInformation?.bank2Name,
                bank2Balance: body.bankInformation?.bank2Balance,
            },
            currentEmployment: {
                QA: {
                    question: body.currentEmployment?.QA?.question,
                    answer: body.currentEmployment?.QA?.answer,
                },
                occupation: body.currentEmployment?.occupation,
                companyName: body.currentEmployment?.companyName,
                companyAddress: body.currentEmployment?.companyAddress,
                city: body.currentEmployment?.city,
                state: body.currentEmployment?.state,
                zipcode: body.currentEmployment?.zipcode,
                supervisorName: body.currentEmployment?.supervisorName,
                supervisorPhone: {
                    code: body.currentEmployment?.supervisorPhone?.code,
                    number: body.currentEmployment?.supervisorPhone?.number,
                },
                jobStartDate: body.currentEmployment?.jobStartDate,
                annualSalary: body.currentEmployment?.annualSalary,
            },
            previousEmployment: {
                QA: {
                    question: body.previousEmployment?.QA?.question,
                    answer: body.currentEmployment?.QA?.answer,
                },
                occupation: body.previousEmployment?.occupation,
                companyName: body.previousEmployment?.companyName,
                companyAddress: body.previousEmployment?.companyAddress,
                city: body.previousEmployment?.city,
                state: body.previousEmployment?.state,
                zipcode: body.previousEmployment?.zipcode,
                supervisorName: body.previousEmployment?.supervisorName,
                supervisorPhone: {
                    code: body.previousEmployment?.supervisorPhone?.code,
                    number: body.previousEmployment?.supervisorPhone?.number,
                },
                jobStartDate: body.previousEmployment?.jobStartDate,
                jobEndDate: body.previousEmployment?.jobEndDate,
                annualSalary: body.previousEmployment?.annualSalary,
            },
            educationInformation: {
                // QA: body.educationInformation?.QA?.map(qa => ({
                //     question: qa.question,
                //     answer: qa.answer,
                // })) || [],
                schoolLastAttended: body.educationInformation?.schoolLastAttended || '',
                startDate: body.educationInformation?.startDate || '',
                endDate: body.educationInformation?.endDate || '',
                degree: body.educationInformation?.degree || '',
            },
            guarantorInformation: {
                QA: body.guarantorInformation?.QA?.map(qa => ({
                    question: qa.question,
                    answer: qa.answer,
                })) || [],
                homeAddress: body.guarantorInformation?.homeAddress || '',
                unit: body.guarantorInformation?.unit || '',
                city: body.guarantorInformation?.city || '',
                state: body.guarantorInformation?.state || '',
                zipcode: body.guarantorInformation?.zipcode || '',
                occupation: body.guarantorInformation?.occupation || '',
                companyName: body.guarantorInformation?.companyName || '',
                companyAddress: body.guarantorInformation?.companyAddress || '',
                moveInDate: body.guarantorInformation?.moveInDate || '',
                monthlyRent: body.guarantorInformation?.monthlyRent || '',
                jobStartDate: body.guarantorInformation?.jobStartDate || '',
                annualSalary: body.guarantorInformation?.annualSalary || '',
                checkingAccountBankName: body.guarantorInformation?.checkingAccountBankName || '',
                checkingAccountNumber: body.guarantorInformation?.checkingAccountNumber || '',
                savingAccountBankName: body.guarantorInformation?.savingAccountBankName || '',
                savingAccountNumber: body.guarantorInformation?.savingAccountNumber || '',
                SSNorTIN: body.guarantorInformation?.SSNorTIN || '',
                drivingLicense: body.guarantorInformation?.drivingLicense || '',
                drivingLicenseState: body.guarantorInformation?.drivingLicenseState || '',
            },
            additionalInformation: {
                QA: body.additionalInformation?.QA?.map(qa => ({
                    question: qa.question,
                    answer: qa.answer,
                    description: qa.description,
                })) || [],

            },
            occupants: {
                totalOccupantsIncludingYou: body.occupants?.totalOccupantsIncludingYou,
            },
            vehicleInformation: {
                QA: {
                    question: body.vehicleInformation?.QA?.question,
                    answer: body.vehicleInformation?.QA?.answer,
                },
                vehicle1LicensePlate: body.vehicleInformation?.vehicle1LicensePlate ?? '',
                vehicle1MakeAndModel: body.vehicleInformation?.vehicle1MakeAndModel ?? '',
                vehicle1ModelYear: body.vehicleInformation?.vehicle1ModelYear ?? '',
                vehicle1State: body.vehicleInformation?.vehicle1State ?? '',
                vehicle2LicensePlate: body.vehicleInformation?.vehicle2LicensePlate ?? '',
                vehicle2MakeAndModel: body.vehicleInformation?.vehicle2MakeAndModel ?? '',
                vehicle2ModelYear: body.vehicleInformation?.vehicle2ModelYear ?? '',
                vehicle2State: body.vehicleInformation?.vehicle2State ?? '',
            },
            documents: uniqueDocuments,
            ownerCode: owner.code,
            // reason: application.reason,
            updatedOn: DateUtil.currentDate(),
        };

        // Perform update
        const updatedScreening = await TenantScreening.findOneAndUpdate(
            { applicationId: body.id }, // Find by applicationId
            updateData,
            { new: true } // Return the updated document
        );

        if (!updatedScreening) {
            console.error(`No screening found with ID: ${body.id}`);
            return res.status(404).json({ message: `No screening found with ID: ${body.id}` });
        }

        // ✅ Log activity only after successful save
        const action = `Updated record in Tenant Screening`;
        await createActivityLog(modulename, action, actionBy);

        // res.status(200).json(updatedScreening);
        res.status(200).json({ message: "Screening updated successfully", data: updatedScreening });
    } catch (error) {
        console.error(`Error in updateScreening: ${error.message}`);
        if (!res.headersSent) {
            res.status(500).json({ message: `Internal server error: ${error.message}` });
        }
    }
}

module.exports = { createScreening, updateScreening };